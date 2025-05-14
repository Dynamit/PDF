// src/app/api/compare-pdfs/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const UPLOAD_DIR = "/tmp"; // Use a temporary directory
const PYTHON_SCRIPT_PATH = path.resolve(process.cwd(), "scripts/compare_texts.py");

// Removed unused ExecError interface

export async function POST(request: NextRequest) {
  const tempFilePaths: string[] = [];
  const tempTextFilePaths: string[] = [];
  let tempJsonOutputPath: string | null = null;

  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });

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
      } catch (err: unknown) {
        console.error(`Error extracting text from ${file.name}:`, err); 
        let errorMessage = `שגיאה בחילוץ טקסט מהקובץ ${file.name}.`;
        let specificStdErr: string | undefined;
        let specificCode: number | undefined;

        if (typeof err === 'object' && err !== null) {
            if ('stderr' in err && typeof (err as {stderr: unknown}).stderr === 'string') {
                specificStdErr = (err as {stderr: string}).stderr;
            }
            if ('code' in err && typeof (err as {code: unknown}).code === 'number') {
                specificCode = (err as {code: number}).code;
            }
        } 

        if (specificStdErr) {
            errorMessage += ` פרטי השגיאה: ${specificStdErr}`;
        }
        if (specificCode === 127) {
            errorMessage = `שגיאה בחילוץ טקסט: פקודת pdftotext לא נמצאה. ודא שהיא מותקנת וזמינה ב-PATH של השרת.`;
        }
        return NextResponse.json({ error: errorMessage }, { status: 500 });
      }
    }

    tempJsonOutputPath = path.join(UPLOAD_DIR, `comparison_output_${Date.now()}.json`);
    
    let pythonExecutable = "python3.11";
    try {
        await execFileAsync(pythonExecutable, ["--version"]);
    } catch (_e: unknown) { // _e is intentionally unused here, only to catch the error
        pythonExecutable = "python3";
        try {
            await execFileAsync(pythonExecutable, ["--version"]);
        } catch (_e2: unknown) { // _e2 is intentionally unused here
            pythonExecutable = "python"; 
        }
    }

    try {
      await execFileAsync(pythonExecutable, [
        PYTHON_SCRIPT_PATH,
        tempTextFilePaths[0],
        tempTextFilePaths[1],
        tempJsonOutputPath,
      ]);
    } catch (err: unknown) {
      console.error("Error running Python comparison script:", err);
      let errorMessage = "שגיאה בביצוע השוואת הטקסטים.";
      let specificStdErr: string | undefined;
      let specificStdOut: string | undefined;
      let specificCode: number | undefined;

      if (typeof err === 'object' && err !== null) {
          if ('stderr' in err && typeof (err as {stderr: unknown}).stderr === 'string') {
              specificStdErr = (err as {stderr: string}).stderr;
          }
          if ('stdout' in err && typeof (err as {stdout: unknown}).stdout === 'string') {
              specificStdOut = (err as {stdout: string}).stdout;
          }
          if ('code' in err && typeof (err as {code: unknown}).code === 'number') {
              specificCode = (err as {code: number}).code;
          }
      } 

      if (specificStdErr) errorMessage += ` פרטי השגיאה: ${specificStdErr}`;
      if (specificStdOut) errorMessage += ` פלט: ${specificStdOut}`;
      if (specificCode === 127) errorMessage = `שגיאה בהשוואה: פקודת ${pythonExecutable} לא נמצאה או שסקריפט הפייתון לא נמצא בנתיב ${PYTHON_SCRIPT_PATH}.`;
      return NextResponse.json({ error: errorMessage, scriptPath: PYTHON_SCRIPT_PATH, textFiles: tempTextFilePaths }, { status: 500 });
    }

    const comparisonResultJson = await fs.readFile(tempJsonOutputPath, "utf-8");
    const comparisonResult = JSON.parse(comparisonResultJson);

    return NextResponse.json(comparisonResult, { status: 200 });

  } catch (error: unknown) {
    console.error("שגיאה כללית בעיבוד הבקשה:", error);
    let detailsMessage = "שגיאה לא ידועה";
    if (error instanceof Error) {
        detailsMessage = error.message;
    } else if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as {message: unknown}).message === 'string') {
        detailsMessage = (error as {message: string}).message;
    } else if (typeof error === 'string') {
        detailsMessage = error;
    }
    return NextResponse.json({ error: "שגיאה פנימית בשרת בעת עיבוד הקבצים.", details: detailsMessage }, { status: 500 });
  } finally {
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


