import RoadToPart7Reading from '../models/RoadToPart7Reading.js';

const listPublishedReadings = async (_req, res, next) => {
  try {
    const items = await RoadToPart7Reading.find({ isPublished: true })
      .select('title order englishText bilingualPairs sourceKey')
      .sort({ order: 1 })
      .lean();
    res.json({ status: 'success', data: { items } });
  } catch (error) {
    next(error);
  }
};

export const listStudentRoadToPart7Readings = listPublishedReadings;
export const listAdminRoadToPart7Readings = listPublishedReadings;
