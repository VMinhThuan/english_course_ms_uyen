import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { uploadToBlob } from '../utils/blobStorage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error('❌ Lỗi: Chưa tìm thấy BLOB_READ_WRITE_TOKEN trong backend/.env');
    console.error('Vui lòng thêm BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... vào backend/.env rồi chạy lại.');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ Lỗi: Chưa có MONGODB_URI trong backend/.env');
    process.exit(1);
  }

  console.log('🚀 Bắt đầu upload ảnh TOEIC Part 1 lên Vercel Blob Storage...');

  // 1. Thư mục chứa 25 ảnh Part 1 cục bộ
  const localImageDir = path.join(__dirname, '../../uploads/public/toeic-question-ocean/part1');
  if (!fs.existsSync(localImageDir)) {
    console.error('❌ Không tìm thấy thư mục ảnh cục bộ tại:', localImageDir);
    process.exit(1);
  }

  const files = fs.readdirSync(localImageDir).filter((f) => /\.(jpe?g|png|webp|svg)$/i.test(f));
  console.log(`📁 Tìm thấy ${files.length} file ảnh Part 1.`);

  const urlMap = new Map(); // localPath -> blobUrl

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filePath = path.join(localImageDir, filename);
    const fileBuffer = fs.readFileSync(filePath);
    const blobPath = `toeic-question-ocean/part1/${filename}`;
    const localRelPath = `/uploads/public/toeic-question-ocean/part1/${filename}`;

    process.stdout.write(`[${i + 1}/${files.length}] Uploading ${filename} ... `);

    try {
      const blob = await uploadToBlob(blobPath, fileBuffer, {
        addRandomSuffix: false,
        contentType: filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
      });
      urlMap.set(localRelPath, blob.url);
      console.log(`✅ Thành công -> ${blob.url}`);
    } catch (err) {
      console.error(`❌ Thất bại: ${err.message}`);
    }
  }

  console.log(`\n🎉 Đã upload ${urlMap.size}/${files.length} ảnh lên Vercel Blob.`);

  // 2. Kết nối MongoDB và cập nhật Database
  console.log('\n🔗 Đang kết nối tới MongoDB để cập nhật URL ảnh...');
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  // Cập nhật questiongroups
  let groupsUpdated = 0;
  const groups = await db.collection('questiongroups').find({
    $or: [
      { imageUrl: { $regex: 'toeic-question-ocean' } },
      { imageUrls: { $regex: 'toeic-question-ocean' } },
    ],
  }).toArray();

  for (const group of groups) {
    let changed = false;
    let newImageUrl = group.imageUrl;
    let newImageUrls = Array.isArray(group.imageUrls) ? [...group.imageUrls] : [];

    if (group.imageUrl && urlMap.has(group.imageUrl)) {
      newImageUrl = urlMap.get(group.imageUrl);
      changed = true;
    }

    if (group.imageUrls?.length) {
      newImageUrls = group.imageUrls.map((u) => urlMap.get(u) || u);
      changed = true;
    }

    if (changed) {
      await db.collection('questiongroups').updateOne(
        { _id: group._id },
        { $set: { imageUrl: newImageUrl, imageUrls: newImageUrls } }
      );
      groupsUpdated++;
    }
  }
  console.log(`✅ Đã cập nhật ${groupsUpdated} QuestionGroup trong MongoDB.`);

  // Cập nhật questions
  let questionsUpdated = 0;
  const questions = await db.collection('questions').find({
    imageUrl: { $regex: 'toeic-question-ocean' },
  }).toArray();

  for (const q of questions) {
    if (q.imageUrl && urlMap.has(q.imageUrl)) {
      await db.collection('questions').updateOne(
        { _id: q._id },
        { $set: { imageUrl: urlMap.get(q.imageUrl) } }
      );
      questionsUpdated++;
    }
  }
  console.log(`✅ Đã cập nhật ${questionsUpdated} Question trong MongoDB.`);

  // Cập nhật attempts (bài thi của học viên bao gồm snapshot)
  let attemptsUpdated = 0;
  const attempts = await db.collection('attempts').find({
    $or: [
      { 'groupSnapshots.imageUrl': { $regex: 'toeic-question-ocean' } },
      { 'questionSnapshots.imageUrl': { $regex: 'toeic-question-ocean' } },
    ],
  }).toArray();

  for (const att of attempts) {
    let changed = false;
    const groupSnapshots = (att.groupSnapshots || []).map((g) => {
      let gChanged = false;
      let img = g.imageUrl;
      let imgs = g.imageUrls;
      if (img && urlMap.has(img)) {
        img = urlMap.get(img);
        gChanged = true;
      }
      if (imgs && Array.isArray(imgs)) {
        imgs = imgs.map((u) => urlMap.get(u) || u);
        gChanged = true;
      }
      if (gChanged) {
        changed = true;
        return { ...g, imageUrl: img, imageUrls: imgs };
      }
      return g;
    });

    const questionSnapshots = (att.questionSnapshots || []).map((q) => {
      if (q.imageUrl && urlMap.has(q.imageUrl)) {
        changed = true;
        return { ...q, imageUrl: urlMap.get(q.imageUrl) };
      }
      return q;
    });

    if (changed) {
      await db.collection('attempts').updateOne(
        { _id: att._id },
        { $set: { groupSnapshots, questionSnapshots } }
      );
      attemptsUpdated++;
    }
  }
  console.log(`✅ Đã cập nhật ${attemptsUpdated} bài thi học viên (attempts) trong MongoDB.`);

  console.log('\n✨ HOÀN TẤT TOÀN BỘ QUÁ TRÌNH! F5 lại trang thi để xem ảnh hiển thị sắc nét từ CDN.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
