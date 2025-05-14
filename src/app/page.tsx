"use client";
import Head from "next/head";
import Image from "next/image";
import { useEffect, useState, useRef, ChangeEvent, FormEvent } from "react";

// Define interfaces for our data structures
interface DiffSegment {
  text: string;
  type: "common" | "changed";
  diff_id?: number;
}

interface DiffTableEntry {
  id: number;
  ima_text: string;
  assuta_text: string;
}

interface DifferencesData {
  doc1_segments: DiffSegment[];
  doc2_segments: DiffSegment[];
  diff_table: DiffTableEntry[];
}

interface Selections {
  [key: number]: "ima" | "assuta";
}

export default function Home() {
  const [data, setData] = useState<DifferencesData | null>(null);
  const [selections, setSelections] = useState<Selections>({});
  const [allSelected, setAllSelected] = useState(false);
  const [showFinalForm, setShowFinalForm] = useState(false);
  const finalFormRef = useRef<HTMLDivElement>(null);

  // New states for file upload
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadInitiated, setUploadInitiated] = useState(false);

  // Effect to check if all differences are selected
  useEffect(() => {
    if (data && data.diff_table.length > 0) {
      setAllSelected(Object.keys(selections).length === data.diff_table.length);
    } else {
      setAllSelected(false);
    }
  }, [selections, data]);

  const handleFile1Change = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile1(e.target.files[0]);
      setError(null); // Clear previous errors on new file selection
    }
  };

  const handleFile2Change = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile2(e.target.files[0]);
      setError(null); // Clear previous errors on new file selection
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file1 || !file2) {
      setError("יש לבחור שני קבצי PDF להשוואה.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setData(null); // Clear previous comparison data
    setSelections({}); // Reset selections
    setUploadInitiated(true);

    const formData = new FormData();
    formData.append("file1", file1);
    formData.append("file2", file2);

    try {
      const response = await fetch("/api/compare-pdfs", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errorMsg = `שגיאה ${response.status} בעת העלאת הקבצים.`;
        try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorData.details || errorMsg;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_jsonParseError: unknown) { 
            errorMsg = response.statusText || errorMsg;
        }
        throw new Error(errorMsg);
      }

      const result: DifferencesData = await response.json();
      setData(result);
    } catch (err: unknown) { 
      if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === "string") {
        setError(err);
      } else {
        setError("אירעה שגיאה לא צפויה.");
      }
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelection = (diffId: number, choice: "ima" | "assuta") => {
    setSelections(prev => ({ ...prev, [diffId]: choice }));
  };

  const getSegmentStyle = (segment: DiffSegment, docType: "ima" | "assuta") => {
    const baseStyle = "inline cursor-pointer hover:opacity-75 transition-opacity";
    if (segment.type === "changed" && segment.diff_id) {
      const selection = selections[segment.diff_id];
      if (selection === docType) {
        return `${baseStyle} bg-green-300 p-1 rounded`;
      }
      return `${baseStyle} ${docType === "ima" ? "bg-red-300" : "bg-blue-300"} p-1 rounded`; 
    }
    return "inline";
  };

  const handleSegmentClick = (segment: DiffSegment, docType: "ima" | "assuta") => {
    if (segment.type === "changed" && segment.diff_id) {
      handleSelection(segment.diff_id, docType);
    }
  };

  const generateFinalForm = () => {
    if (!data || !allSelected) return null;
    const finalSegments: { text: string, source: string }[] = [];

    data.diff_table.forEach(diff => {
        const choice = selections[diff.id];
        if (choice === "ima") {
            finalSegments.push({ text: diff.ima_text, source: "IMA" });
        } else if (choice === "assuta") {
            finalSegments.push({ text: diff.assuta_text, source: "Assuta" });
        }
    });
    
    return (
      <div ref={finalFormRef} className="final-form p-8 bg-white shadow-lg rounded-lg max-w-4xl mx-auto my-10 text-right" dir="rtl">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold text-blue-700">טופס הסכמה סופי</h2>
          <Image src="/assuta_logo.gif" alt="לוגו אסותא" width={150} height={50} unoptimized />
        </div>
        {finalSegments.map((segment, index) => (
          <span key={index} className={`source-${segment.source.toLowerCase()} mr-1`}>{segment.text}</span>
        ))}
        {finalSegments.length === 0 && <p>לא נבחרו הבדלים, או שמבנה הנתונים אינו מאפשר יצירת טופס מלא.</p>}
        <button 
          onClick={() => window.print()}
          className="mt-8 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-150 ease-in-out print-button"
        >
          הדפס טופס
        </button>
      </div>
    );
  };

  if (showFinalForm) {
    return generateFinalForm();
  }

  const numSelected = Object.keys(selections).length;
  const totalDiffs = data ? data.diff_table.length : 0;
  const progressPercentage = totalDiffs > 0 ? (numSelected / totalDiffs) * 100 : 0;

  return (
    <>
      <Head>
        <title>השוואת טפסי הסכמה</title>
        <meta name="description" content="מערכת להשוואת טפסי הסכמה רפואיים ובחירת גרסה מועדפת" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main dir="rtl" className="container mx-auto p-4 min-h-screen bg-gray-100">
        <header className="text-center py-8 bg-white shadow-lg rounded-xl mb-8">
          <h1 className="text-4xl font-bold text-blue-800">מערכת השוואת טפסי הסכמה רפואיים</h1>
          <p className="text-lg text-gray-700 mt-2">העלה שני קבצי PDF, השווה ביניהם, בחר את הנוסח המועדף וצור טופס סופי.</p>
        </header>

        <form onSubmit={handleSubmit} className="mb-8 p-6 bg-white shadow-md rounded-lg">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">העלאת קבצים להשוואה</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            <div>
              <label htmlFor="file1" className="block text-sm font-medium text-gray-700 mb-1">קובץ PDF ראשון (למשל, הר&quot;י):</label> 
              <input type="file" id="file1" accept=".pdf" onChange={handleFile1Change} className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none p-2" />
            </div>
            <div>
              <label htmlFor="file2" className="block text-sm font-medium text-gray-700 mb-1">קובץ PDF שני (למשל, אסותא):</label>
              <input type="file" id="file2" accept=".pdf" onChange={handleFile2Change} className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none p-2" />
            </div>
          </div>
          <button type="submit" disabled={isLoading || !file1 || !file2} className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed">
            {isLoading ? "מעבד קבצים..." : "השווה קבצים"}
          </button>
          {error && <p className="text-red-500 mt-4 text-sm">שגיאה: {error}</p>}
        </form>

        {isLoading && (
          <div className="flex justify-center items-center my-10">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
            <p className="ml-3 text-gray-700">מעבד את הקבצים, אנא המתן...</p>
          </div>
        )}

        {!isLoading && data && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 bg-white p-6 rounded-lg shadow-xl h-full flex flex-col sticky top-6">
              <h2 className="text-2xl font-semibold mb-1 text-blue-700 border-b-2 border-gray-300 pb-2">טבלת ההבדלים</h2>
              <div className="my-3">
                <div className="text-sm font-medium text-gray-700 mb-1">התקדמות: {numSelected} מתוך {totalDiffs} הבדלים נבחרו</div>
                <div className="w-full bg-gray-200 rounded-full h-4 shadow-inner">
                  <div 
                    className="bg-green-500 h-4 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercentage}%` }}
                  ></div>
                </div>
              </div>
              <p className="text-xs text-gray-600 mb-4">הקלק על קטע טקסט צבעוני במסמכים או בחר מהטבלה. הטקסט הנבחר יודגש בירוק. לאחר בחירת כל ההבדלים, כפתור {`"יצירת טופס סופי"`} יהפוך לפעיל.</p>
              
              <div className="overflow-y-auto flex-grow max-h-[calc(100vh-320px)] pr-2 border rounded-md bg-gray-50 p-1">
                {data.diff_table.length === 0 && <p className="text-gray-500 text-center py-4">לא נמצאו הבדלים או שהקבצים זהים.</p>}
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-gray-100 z-10">
                    <tr>
                      <th className="px-3 py-3 text-right border-b-2 border-gray-300 font-semibold text-gray-800">#</th>
                      <th className="px-3 py-3 text-right border-b-2 border-gray-300 font-semibold text-gray-800">נוסח קובץ 1 (אדום)</th>
                      <th className="px-3 py-3 text-right border-b-2 border-gray-300 font-semibold text-gray-800">נוסח קובץ 2 (כחול)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.diff_table.map((diff) => (
                      <tr key={diff.id} className={`${selections[diff.id] ? "bg-green-100" : ""} hover:bg-gray-100 transition-colors duration-150`}>
                        <td className="border-b border-gray-200 px-3 py-3 align-top font-medium">{diff.id}</td>
                        <td className="border-b border-gray-200 px-3 py-3 align-top">
                          <label className="flex items-start cursor-pointer p-1 rounded hover:bg-red-100 transition-colors">
                            <input 
                              type="radio" 
                              name={`diff-${diff.id}`} 
                              value="ima" 
                              checked={selections[diff.id] === "ima"}
                              onChange={() => handleSelection(diff.id, "ima")}
                              className="mr-2 mt-1 accent-red-500 focus:ring-red-400"
                            />
                            <span className="text-gray-800 text-xs leading-relaxed">{diff.ima_text}</span>
                          </label>
                        </td>
                        <td className="border-b border-gray-200 px-3 py-3 align-top">
                          <label className="flex items-start cursor-pointer p-1 rounded hover:bg-blue-100 transition-colors">
                            <input 
                              type="radio" 
                              name={`diff-${diff.id}`} 
                              value="assuta" 
                              checked={selections[diff.id] === "assuta"}
                              onChange={() => handleSelection(diff.id, "assuta")}
                              className="mr-2 mt-1 accent-blue-500 focus:ring-blue-400"
                            />
                            <span className="text-gray-800 text-xs leading-relaxed">{diff.assuta_text}</span>
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button 
                onClick={() => setShowFinalForm(true)} 
                disabled={!allSelected || totalDiffs === 0}
                className="w-full mt-6 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition duration-150 ease-in-out disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
              >
                יצירת טופס סופי
              </button>
            </div>

            <div className="md:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-lg shadow-xl">
                <h3 className="text-xl font-semibold mb-4 text-red-700 border-b-2 border-red-200 pb-2">קובץ 1 (למשל, הר&quot;י)</h3>
                <div className="text-right leading-relaxed whitespace-pre-wrap text-sm font-mono bg-red-50 p-3 rounded-md h-96 overflow-y-auto border border-red-200">
                  {data.doc1_segments.map((seg, index) => (
                    <span key={`doc1-${index}`} className={getSegmentStyle(seg, "ima")} onClick={() => handleSegmentClick(seg, "ima")}>
                      {seg.text}
                      {seg.type === "changed" && <sup className="text-xs font-bold text-red-700">({seg.diff_id})</sup>}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-xl">
                <h3 className="text-xl font-semibold mb-4 text-blue-700 border-b-2 border-blue-200 pb-2">קובץ 2 (למשל, אסותא)</h3>
                <div className="text-right leading-relaxed whitespace-pre-wrap text-sm font-mono bg-blue-50 p-3 rounded-md h-96 overflow-y-auto border border-blue-200">
                  {data.doc2_segments.map((seg, index) => (
                    <span key={`doc2-${index}`} className={getSegmentStyle(seg, "assuta")} onClick={() => handleSegmentClick(seg, "assuta")}>
                      {seg.text}
                      {seg.type === "changed" && <sup className="text-xs font-bold text-blue-700">({seg.diff_id})</sup>}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {!isLoading && uploadInitiated && !data && !error && (
            <div className="text-center py-10 text-gray-600">
                <p>ההשוואה הסתיימה. אם אינך רואה תוצאות, ייתכן שהקבצים זהים או שאירעה שגיאה שלא נתפסה.</p>
            </div>
        )}

      </main>
    </>
  );
}

