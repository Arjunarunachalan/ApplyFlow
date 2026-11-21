import nodemailer from "nodemailer";
import path from "path";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export const sendApplicationEmail = async ({
  to,
  subject,
  body,
  resumePath,
  resumeFileName,
}) => {
  const mailOptions = {
    from: process.env.GMAIL_USER,
    to,
    subject,
    text: body,
    attachments: resumePath
      ? [
          {
            filename: resumeFileName || path.basename(resumePath),
            path: resumePath,
          },
        ]
      : [],
  };

  const info = await transporter.sendMail(mailOptions);
  return info.messageId;
};

// The daily digest goes to the owner's own mailbox.
export const sendDigestEmail = async ({ subject, text, html }) => {
  const info = await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.GMAIL_USER,
    subject,
    text,
    ...(html ? { html } : {}),
  });

  return info.messageId;
};