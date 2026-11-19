import RoadToPart7Reading from '../models/RoadToPart7Reading.js';

const listReadings = (publishedOnly) => async (_req, res, next) => {
  try {
    const items = await RoadToPart7Reading.find(publishedOnly ? { isPublished: true } : {})
      .select('title order englishText bilingualPairs sourceKey')
      .sort({ order: 1 })
      .lean();
    res.json({ status: 'success', data: { items } });
  } catch (error) {
    next(error);
  }
};

export const listStudentRoadToPart7Readings = listReadings(true);
export const listAdminRoadToPart7Readings = listReadings(false);
