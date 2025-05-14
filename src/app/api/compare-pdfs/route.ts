// src/app/api/compare-pdfs/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const UPLOAD_DIR = "/tmp"; // Use a temporary directory
// Assuming the script is in medical_form_comparator/scripts/compare_texts.py
// Adjust the path if your project structure is different during deployment
const PYTHON_SCRIPT_PATH = path.resolve(process.cwd(), "scripts/compare_texts.py");

export async function POST(request: NextRequest) {
  let tempFilePaths: string[] = []; // For uploaded PDFs
  let tempTextFilePaths: string[] = []; // For extracted .txt files
  let tempJsonOutputPath: string | null = null; // For comparison_output.json

  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true }); // Ensure upload directory exists

    const formData = await request.formData();
    const file1 = formData.get("file1") as File | null;
    const file2 = formData.get("file2") as File | null;

    if (!file1 || !file2) {
      return NextResponse.json({ error: "יש להעלות שני קבצים." }, { status: 400 });
    }

    const files = [file1, file2];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `הקובץ ${file.name} גדול מדי (מקסימום 1MB).` }, { status: 400 });
      }
      if (file.type !== "application/pdf") {
        return NextResponse.json({ error: `הקובץ ${file.name} אינו קובץ PDF.` }, { status: 400 });
      }

      const tempFileName = `upload_${Date.now()}_${i}_${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const tempFilePath = path.join(UPLOAD_DIR, tempFileName);
      tempFilePaths.push(tempFilePath);

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await fs.writeFile(tempFilePath, buffer);

      const tempTextFileName = `extracted_${Date.now()}_${i}.txt`;
      const tempTextFilePath = path.join(UPLOAD_DIR, tempTextFileName);
      tempTextFilePaths.push(tempTextFilePath);

      try {
        await execFileAsync("pdftotext", ["-enc", "UTF-8", tempFilePath, tempTextFilePath]);
      } catch (err: any) {
        console.error(`Error extracting text from ${file.name}:`, err);
        let errorMessage = `שגיאה בחילוץ טקסט מהקובץ ${file.name}.`;
        if (err.stderr) errorMessage += ` פרטי השגיאה: ${err.stderr}`;
        if (err.code === 127) errorMessage = `שגיאה בחילוץ טקסט: פקודת pdftotext לא נמצאה. ודא שהיא מותקנת וזמינה ב-PATH של השרת.`;
        return NextResponse.json({ error: errorMessage }, { status: 500 });
      }
    }

    // Now call the Python script for comparison
    tempJsonOutputPath = path.join(UPLOAD_DIR, `comparison_output_${Date.now()}.json`);
    
    // Check if python3.11 is available, otherwise try python3 or python
    let pythonExecutable = "python3.11";
    try {
        await execFileAsync(pythonExecutable, ["--version"]);
    } catch (e) {
        pythonExecutable = "python3";
        try {
            await execFileAsync(pythonExecutable, ["--version"]);
        } catch (e2) {
            pythonExecutable = "python"; // Fallback to just python
        }
    }

    try {
      await execFileAsync(pythonExecutable, [
        PYTHON_SCRIPT_PATH,
        tempTextFilePaths[0],
        tempTextFilePaths[1],
        tempJsonOutputPath,
      ]);
    } catch (err: any) {
      console.error("Error running Python comparison script:", err);
      let errorMessage = "שגיאה בביצוע השוואת הטקסטים.";
      if (err.stderr) errorMessage += ` פרטי השגיאה: ${err.stderr}`;
      if (err.stdout) errorMessage += ` פלט: ${err.stdout}`;
      if (err.code === 127) errorMessage = `שגיאה בהשוואה: פקודת ${pythonExecutable} לא נמצאה או שסקריפט הפייתון לא נמצא בנתיב ${PYTHON_SCRIPT_PATH}.`;
      return NextResponse.json({ error: errorMessage, scriptPath: PYTHON_SCRIPT_PATH, textFiles: tempTextFilePaths }, { status: 500 });
    }

    const comparisonResultJson = await fs.readFile(tempJsonOutputPath, "utf-8");
    const comparisonResult = JSON.parse(comparisonResultJson);

    return NextResponse.json(comparisonResult, { status: 200 });

  } catch (error: any) {
    console.error("שגיאה כללית בעיבוד הבקשה:", error);
    return NextResponse.json({ error: "שגיאה פנימית בשרת בעת עיבוד הקבצים.", details: error.message }, { status: 500 });
  } finally {
    // Clean up temporary files
    const filesToClean = [...tempFilePaths, ...tempTextFilePaths];
    if (tempJsonOutputPath) {
      filesToClean.push(tempJsonOutputPath);
    }
    for (const filePath of filesToClean) {
      try {
        if (filePath) await fs.unlink(filePath);
      } catch (cleanupError) {
        console.error(`Failed to delete temporary file ${filePath}:`, cleanupError);
      }
    }
  }
}

