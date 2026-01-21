const path = require("path");
const fs = require("fs");
const xlsx = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function toIntOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeKey(k) {
  return String(k || "").trim();
}

async function main() {
  const semesterArg = process.argv[2]; // 例如 1141
  if (!semesterArg) {
    console.error("Usage: node scripts/importRawCourses.js 1141");
    process.exit(1);
  }

  const filePath = path.join(
    __dirname,
    "..",
    "data",
    "raw",
    semesterArg,
    `課程查詢_${semesterArg}.xls`
  );

  if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    process.exit(1);
  }

  const wb = xlsx.readFile(filePath, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  // 先讀成「二維陣列」
  const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  // 找到真正表頭列：必須同時包含幾個關鍵欄位
  const mustHave = ["學期", "科目代碼", "科目中文名稱", "上課星期", "上課節次"];
  let headerRowIndex = -1;

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i].map((x) => String(x).trim());
    const ok = mustHave.every((kw) => row.some((cell) => cell.includes(kw)));
    if (ok) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    console.error("找不到表頭列（header row）。");
    console.log("前 20 列預覽：");
    console.log(matrix.slice(0, 20));
    process.exit(1);
  }

  const headers = matrix[headerRowIndex].map(normalizeKey);
  console.log("Detected header row index:", headerRowIndex);
  console.log("Headers sample:", headers.slice(0, 15));

  // 由表頭下一列開始，轉成物件陣列 rows
  const rows = [];
  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const arr = matrix[i];
    if (!arr || arr.every((v) => String(v).trim() === "")) continue;

    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      obj[key] = arr[c];
    }
    rows.push(obj);
  }

  console.log(`Loaded rows: ${rows.length} from ${filePath}`);

  // 用「包含字」找欄位（避免全形括號/空白差異）
  const pickKey = (obj, contains) => {
    const keys = Object.keys(obj);
    return keys.find((k) => k.includes(contains));
  };

  let inserted = 0;
  let skipped = 0;
  const batchSize = 200;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const data = batch
      .map((r) => {
        const kSemester = pickKey(r, "學期");
        const kSubject = pickKey(r, "科目代碼") && pickKey(r, "新碼");
        const kClassGroup = pickKey(r, "上課班組");
        const kDay = pickKey(r, "上課星期");
        const kPeriods = pickKey(r, "上課節次");
        const kLocation = pickKey(r, "上課地點");

        const semester = String((kSemester ? r[kSemester] : semesterArg) || semesterArg).trim();
        const subjectCode = String((kSubject ? r[kSubject] : "") || "").trim();
        const classGroup = String((kClassGroup ? r[kClassGroup] : "") || "").trim() || null;
        const dayOfWeek = toIntOrNull(kDay ? r[kDay] : null);
        const periods = String((kPeriods ? r[kPeriods] : "") || "").trim() || null;
        const location = String((kLocation ? r[kLocation] : "") || "").trim() || null;

        return {
          semester,
          subjectCode,
          classGroup,
          dayOfWeek,
          periods,
          location,
          raw: r,
        };
      })
      .filter((d) => d.subjectCode); // 沒科目代碼的列丟掉

    const result = await prisma.rawCourse.createMany({
      data,
      skipDuplicates: true,
    });

    inserted += result.count;
    skipped += data.length - result.count;
    console.log(`Batch ${i / batchSize + 1}: +${result.count}, skipped ${data.length - result.count}`);
  }

  console.log(`Done. inserted=${inserted}, skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
