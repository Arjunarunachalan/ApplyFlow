import { ImapFlow } from "imapflow";
import Application from "../models/Application.js";
import Job from "../models/Job.js";

/**
 * HR reply and bounce detection over Gmail IMAP.
 *
 * The sync is read-only: it never sends or deletes mail. A message counts as a
 * reply when it is threaded to the sent application (In-Reply-To/References),
 * comes from the recipient we wrote to, or comes from the recipient's domain
 * about the same role. Delivery failures are recognised from the sender
 * (mailer-daemon/postmaster) and the bounced address in the message.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 7;
const SNIPPET_LENGTH = 200;
const MAX_SOURCE_BYTES = 512 * 1024;

const normalizeWhitespace = (value) =>
  String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

const cleanAddress = (value) => String(value || "").toLowerCase().trim();

const domainOf = (email) => {
  const address = cleanAddress(email);
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1);
};

const normalizeSubject = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/^((re|fw|fwd)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim();

const headerList = (value) =>
  String(value || "")
    .split(/[\s,]+/)
    .map((item) => item.replace(/[<>]/g, "").trim().toLowerCase())
    .filter(Boolean);

// Reads the raw RFC822 source into a lower-cased header map plus the body.
const splitMessage = (source) => {
  const text = source.toString("utf8");
  const crlf = text.indexOf("\r\n\r\n");
  const lf = text.indexOf("\n\n");
  const separator = crlf !== -1 ? crlf : lf;
  const rawHeaders = separator !== -1 ? text.slice(0, separator) : text;
  const rawBody =
    separator !== -1
      ? text.slice(separator + (separator === crlf ? 4 : 2))
      : "";

  const headers = new Map();
  let current = null;
  for (const line of rawHeaders.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && current) {
      headers.set(current, `${headers.get(current)} ${line.trim()}`);
      continue;
    }
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    current = line.slice(0, colon).trim().toLowerCase();
    headers.set(current, line.slice(colon + 1).trim());
  }

  return { headers, rawBody };
};

const decodeQuotedPrintable = (value) =>
  value
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );

// Deliberately forgiving: bounce reports and HR replies are short plain-text
// messages, so a full MIME tree walk would be more code than benefit.
const bodyText = (headers, rawBody) => {
  const encoding = String(headers.get("content-transfer-encoding") || "")
    .toLowerCase()
    .trim();
  let body = rawBody;

  const boundary = String(headers.get("content-type") || "").match(
    /boundary="?([^";]+)"?/i,
  )?.[1];

  if (boundary) {
    const parts = body.split(`--${boundary}`);
    const textPart = parts.find((part) => {
      const head = part.slice(0, part.indexOf("\n\n") + 1).toLowerCase();
      return head.includes("text/plain");
    });
    if (textPart) body = textPart;
  }

  // Strip per-part MIME headers when a boundary was present.
  const blankLine = body.search(/\r?\n\r?\n/);
  if (blankLine !== -1) {
    const possibleHeaders = body.slice(0, blankLine).toLowerCase();
    if (/content-(type|transfer-encoding):/.test(possibleHeaders)) {
      body = body.slice(blankLine).replace(/^\r?\n\r?\n/, "");
    }
  }

  if (encoding === "base64") {
    body = Buffer.from(body.replace(/[^A-Za-z0-9+/=]/g, ""), "base64").toString(
      "utf8",
    );
  } else if (encoding === "quoted-printable") {
    body = decodeQuotedPrintable(body);
  }

  if (/<[a-z][\s\S]*>/i.test(body)) {
    body = body
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }

  return normalizeWhitespace(body);
};

// Drops the quoted history so the stored snippet is what the human actually wrote.
const replySnippetOf = (text) => {
  const lines = normalizeWhitespace(text).split("\n");
  const kept = [];
  for (const line of lines) {
    if (/^>/.test(line.trim())) break;
    if (/^on .+wrote:$/i.test(line.trim())) break;
    if (/^-{2,}\s*original message\s*-{2,}$/i.test(line.trim())) break;
    kept.push(line);
  }
  const snippet = normalizeWhitespace(kept.join(" ")).slice(0, SNIPPET_LENGTH);
  return snippet;
};

const isBounceSender = (address) => {
  const value = cleanAddress(address);
  return value.includes("mailer-daemon") || value.includes("postmaster");
};

const mentionsAddress = (haystack, address) => {
  const needle = cleanAddress(address);
  if (!needle) return false;
  return haystack.toLowerCase().includes(needle);
};

const loadSentApplications = () =>
  Application.find({ status: "sent" })
    .populate("jobId")
    .sort({ sentAt: -1 })
    .lean();

const matchApplication = (message, applications) => {
  const threadIds = new Set([
    ...headerList(message.inReplyTo),
    ...headerList(message.references),
  ]);
  const fromAddress = cleanAddress(message.fromAddress);
  const fromDomain = domainOf(fromAddress);
  const subject = normalizeSubject(message.subject);

  if (threadIds.size) {
    const threaded = applications.find(
      (application) =>
        application.messageId &&
        threadIds.has(String(application.messageId).replace(/[<>]/g, "").toLowerCase()),
    );
    if (threaded) return threaded;
  }

  const direct = applications.find(
    (application) => cleanAddress(application.recipientEmail) === fromAddress,
  );
  if (direct) return direct;

  // Same HR mailbox domain and the subject still carries the original subject
  // or the role/company — enough to attribute a reply that lost its headers.
  return (
    applications.find((application) => {
      const recipientDomain = domainOf(application.recipientEmail);
      if (!recipientDomain || recipientDomain !== fromDomain) return false;

      const appSubject = normalizeSubject(application.subject);
      if (appSubject && (subject.includes(appSubject) || appSubject.includes(subject))) {
        return true;
      }

      const role = normalizeSubject(application.jobId?.jobRole);
      const company = normalizeSubject(application.jobId?.companyName);
      return (
        (role.length > 2 && subject.includes(role)) ||
        (company.length > 2 && subject.includes(company))
      );
    }) || null
  );
};

const connect = () =>
  new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    logger: false,
  });

// One sync at a time; the periodic job and a manual click can overlap otherwise.
let inFlight = null;

const runSync = async () => {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return {
      checked: 0,
      repliesFound: 0,
      bouncesFound: 0,
      error: "GMAIL_USER / GMAIL_APP_PASSWORD are not configured",
    };
  }

  const applications = await loadSentApplications();
  const sentApplications = applications.filter(
    (application) => application.jobId && application.jobId.status === "sent",
  );

  if (!sentApplications.length) {
    return { checked: 0, repliesFound: 0, bouncesFound: 0 };
  }

  const client = connect();
  let checked = 0;
  let repliesFound = 0;
  let bouncesFound = 0;

  try {
    await client.connect();

    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);
      const uids = await client.search({ since }, { uid: true });
      if (!uids.length) return { checked: 0, repliesFound: 0, bouncesFound: 0 };

      for await (const message of client.fetch(
        uids,
        { uid: true, envelope: true, source: true, size: true },
        { uid: true },
      )) {
        checked += 1;

        const source =
          message.source && message.source.length <= MAX_SOURCE_BYTES
            ? message.source
            : null;
        const parsed = source ? splitMessage(source) : { headers: new Map(), rawBody: "" };

        const fromAddress = cleanAddress(message.envelope?.from?.[0]?.address || "");
        const subject = String(
          message.envelope?.subject || parsed.headers.get("subject") || "",
        );
        const text = parsed.rawBody ? bodyText(parsed.headers, parsed.rawBody) : "";
        const haystack = `${subject}\n${text}`;

        // Delivery failure: the bounce names the address we wrote to.
        if (isBounceSender(fromAddress)) {
          const targets = sentApplications.filter((application) =>
            mentionsAddress(haystack, application.recipientEmail),
          );
          if (!targets.length) continue;

          for (const application of targets) {
            await Application.findByIdAndUpdate(application._id, {
              $set: {
                status: "failed",
                deliveryStatus: "FAILED",
                errorLog: "Bounced / Undeliverable",
              },
            });
            if (application.jobId?._id) {
              await Job.findByIdAndUpdate(application.jobId._id, {
                $set: { status: "failed", lifecycleStatus: "SEND_FAILED" },
              });
            }
          }
          bouncesFound += targets.length;
          continue;
        }

        const match = matchApplication(
          {
            inReplyTo: parsed.headers.get("in-reply-to"),
            references: parsed.headers.get("references"),
            fromAddress,
            subject,
          },
          sentApplications,
        );
        if (!match) continue;

        const snippet = replySnippetOf(text) || normalizeWhitespace(subject).slice(0, SNIPPET_LENGTH);

        await Application.findByIdAndUpdate(match._id, {
          $set: {
            status: "replied",
            repliedAt: message.envelope?.date ? new Date(message.envelope.date) : new Date(),
            replySnippet: snippet,
          },
        });
        if (match.jobId?._id) {
          await Job.findByIdAndUpdate(match.jobId._id, {
            $set: { status: "replied", outcomeStatus: "replied", lifecycleStatus: "SENT" },
          });
        }

        repliesFound += 1;
      }
    } finally {
      lock.release();
    }
  } catch (error) {
    return {
      checked,
      repliesFound,
      bouncesFound,
      error: `IMAP sync failed: ${error.message}`,
    };
  } finally {
    // logout() throws when the server already dropped the connection.
    await client.logout().catch(() => {});
  }

  return { checked, repliesFound, bouncesFound };
};

export const syncReplies = async () => {
  if (inFlight) return inFlight;
  inFlight = runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
};

export default { syncReplies };
