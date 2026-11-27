import Application from "../models/Application.js";
import Job, {
  computeApplicationType,
  deriveContactStatus,
  deriveLifecycleFromJob,
} from "../models/Job.js";
import Profile from "../models/Profile.js";
import Resume from "../models/Resume.js";

/**
 * Assigns any unowned legacy records in MongoDB to the single owner user
 * and backfills new lifecycle/contact/delivery fields without dropping data.
 */
export const claimLegacyRecordsForUser = async (userId) => {
  if (!userId) return;

  const missingOwnerFilter = { $or: [{ userId: { $exists: false } }, { userId: null }] };

  await Promise.all([
    Profile.updateMany(missingOwnerFilter, { $set: { userId } }),
    Resume.updateMany(missingOwnerFilter, { $set: { userId } }),
    Job.updateMany(missingOwnerFilter, { $set: { userId } }),
    Application.updateMany(missingOwnerFilter, { $set: { userId } }),
  ]);

  const unmigratedJobs = await Job.find({
    userId,
    $or: [{ lifecycleStatus: { $exists: false } }, { lifecycleStatus: "IMPORTED" }],
  }).limit(500);

  if (unmigratedJobs.length) {
    const jobOps = unmigratedJobs.map((job) => {
      const applicationType = computeApplicationType(job.hrEmail, job.applyUrl);
      const contactStatus = deriveContactStatus({
        hrEmail: job.hrEmail,
        contactStatus: job.contactStatus,
      });
      const lifecycleStatus = deriveLifecycleFromJob({
        status: job.status,
        lifecycleStatus: job.lifecycleStatus,
        hrEmail: job.hrEmail,
        applyUrl: job.applyUrl,
        applicationType,
      });
      const outcomeStatus = ["replied", "interview", "rejected"].includes(job.status)
        ? job.status
        : job.outcomeStatus || "none";
      const priorityScore = Math.min(
        120,
        Math.round((Number(job.matchScore) || 0) + (applicationType === "email" ? 20 : 0)),
      );

      return {
        updateOne: {
          filter: { _id: job._id },
          update: {
            $set: {
              applicationType,
              contactStatus,
              lifecycleStatus,
              outcomeStatus,
              priorityScore,
            },
          },
        },
      };
    });
    await Job.bulkWrite(jobOps);
  }

  const unmigratedApps = await Application.find({
    userId,
    deliveryStatus: { $exists: false },
  }).limit(500);

  if (unmigratedApps.length) {
    const appOps = unmigratedApps.map((app) => {
      let deliveryStatus = "NOT_SENT";
      if (["sent", "replied", "interview", "rejected"].includes(app.status)) {
        deliveryStatus = "ACCEPTED_BY_GMAIL";
      } else if (app.status === "queued") {
        deliveryStatus = "QUEUED";
      } else if (app.status === "failed") {
        deliveryStatus = "FAILED";
      }
      return {
        updateOne: {
          filter: { _id: app._id },
          update: { $set: { deliveryStatus } },
        },
      };
    });
    await Application.bulkWrite(appOps);
  }
};
