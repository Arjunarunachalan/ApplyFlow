import ImportBatch from "../models/ImportBatch.js";

// GET /api/imports
export const listImportBatches = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filter = { userId: req.user._id };

    if (req.query.importType && req.query.importType !== "all") {
      filter.importType = String(req.query.importType).toLowerCase();
    }

    const [items, total] = await Promise.all([
      ImportBatch.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ImportBatch.countDocuments(filter),
    ]);

    return res.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
