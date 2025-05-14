import difflib
import json
import sys

def compare_text_files(file1_path, file2_path, output_json_path):
    with open(file1_path, 'r', encoding='utf-8') as f1:
        lines1 = f1.readlines()
    with open(file2_path, 'r', encoding='utf-8') as f2:
        lines2 = f2.readlines()

    lines1 = [line.rstrip('\n').rstrip('\f') for line in lines1]
    lines2 = [line.rstrip('\n').rstrip('\f') for line in lines2]

    s = difflib.SequenceMatcher(None, lines1, lines2, autojunk=False)
    opcodes = s.get_opcodes()

    doc1_segments = []
    doc2_segments = []
    diff_table = []
    diff_counter = 0

    for tag, i1, i2, j1, j2 in opcodes:
        segment1_lines = lines1[i1:i2]
        segment2_lines = lines2[j1:j2]

        text1_segment_str = "\n".join(segment1_lines)
        text2_segment_str = "\n".join(segment2_lines)

        if tag == 'equal':
            doc1_segments.append({
                "text": text1_segment_str,
                "type": "equal",
                "diff_id": None
            })
            doc2_segments.append({
                "text": text2_segment_str,
                "type": "equal",
                "diff_id": None
            })
        else:  # 'replace', 'delete', 'insert'
            diff_counter += 1
            current_diff_id = diff_counter
            
            ima_text_for_table = ""
            assuta_text_for_table = ""
            doc1_current_segment = {"text": "", "type": "changed", "diff_id": current_diff_id}
            doc2_current_segment = {"text": "", "type": "changed", "diff_id": current_diff_id}

            if tag == 'replace':
                ima_text_for_table = text1_segment_str
                assuta_text_for_table = text2_segment_str
                doc1_current_segment["text"] = ima_text_for_table
                doc1_current_segment["original_tag"] = "replace"
                doc2_current_segment["text"] = assuta_text_for_table
                doc2_current_segment["original_tag"] = "replace"
            elif tag == 'delete':  # Present in doc1, absent in doc2
                ima_text_for_table = text1_segment_str
                assuta_text_for_table = "" 
                doc1_current_segment["text"] = ima_text_for_table
                doc1_current_segment["original_tag"] = "delete"
                doc2_current_segment["text"] = "" # Explicitly empty for Assuta's side of this diff
                doc2_current_segment["original_tag"] = "delete" # Mirrored tag
            elif tag == 'insert':  # Absent in doc1, present in doc2
                ima_text_for_table = "" 
                assuta_text_for_table = text2_segment_str
                doc1_current_segment["text"] = "" # Explicitly empty for IMA's side of this diff
                doc1_current_segment["original_tag"] = "insert" # Mirrored tag
                doc2_current_segment["text"] = assuta_text_for_table
                doc2_current_segment["original_tag"] = "insert"
            
            doc1_segments.append(doc1_current_segment)
            doc2_segments.append(doc2_current_segment)
            
            diff_table.append({
                "id": current_diff_id,
                "ima_text": ima_text_for_table,
                "assuta_text": assuta_text_for_table
            })

    output_data = {
        "doc1_segments": doc1_segments,
        "doc2_segments": doc2_segments,
        "diff_table": diff_table
    }

    with open(output_json_path, 'w', encoding='utf-8') as outfile:
        json.dump(output_data, outfile, ensure_ascii=False, indent=2)

    print(f"Comparison saved to {output_json_path}")

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python compare_texts.py <file1_path> <file2_path> <output_json_path>")
        sys.exit(1)
    
    file1 = sys.argv[1]
    file2 = sys.argv[2]
    output_file = sys.argv[3]
    compare_text_files(file1, file2, output_file)

