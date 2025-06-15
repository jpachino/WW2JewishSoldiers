import pandas as pd
import re
from g2p_en import G2p

# Load name overrides from CSV
def load_name_overrides(file_path='name_overrides.csv'):
    try:
        df = pd.read_csv(file_path)
        return dict(zip(df['English'].str.strip().str.title(), df['Hebrew'].str.strip()))
    except Exception as e:
        print(f"⚠️ Error loading name overrides: {e}")
        return {}

# Improved ARPAbet phoneme to Hebrew mapping
phoneme_to_hebrew = {
    'A': 'אַ','AA': 'אַ', 'AE': 'ע', 'AH': 'ה', 'AO': 'או',
    'AW': 'או', 'AY': 'אֵי', 'B': 'ב', 'CH': 'צ׳',
    'D': 'ד', 'DH': 'ד׳','E': 'ע', 'EH': 'אֶ', 'ER': 'ר', 'EY': 'אֵי',
    'F': 'פ', 'G': 'ג', 'HH': 'ה', 'IH': 'י', 'IY': 'י',
    'JH': 'ג׳', 'K': 'ק', 'L': 'ל', 'M': 'מ', 'N': 'נ', 'NG': 'נג',
    'OW': 'וֹ', 'OY': 'וי', 'P': 'פ', 'R': 'ר', 'S': 'ס',
    'SH': 'ש', 'T': 'ט', 'TH': 'ת׳', 'UH': 'וּ', 'UW': 'וּ',
    'V': 'ו', 'W': 'ו', 'Y': 'י', 'Z': 'ז', 'ZH': 'ז׳', ' ': ' '
}

# Final letter replacements in Hebrew
final_letter_map = {
    'מ': 'ם',
    'נ': 'ן',
    'צ': 'ץ',
    'פ': 'ף',
    'כ': 'ך'
}

# Remove punctuation and non-word characters
def clean_input(word):
    return re.sub(r'[^\w\s]', '', word)

# Apply Hebrew final letter forms
def apply_final_forms(hebrew_word):
    if not hebrew_word:
        return hebrew_word
    last_char = hebrew_word[-1]
    return hebrew_word[:-1] + final_letter_map.get(last_char, last_char)

# Transliterates one word from English to Hebrew
def transliterate_to_hebrew(name, overrides, g2p):
    if not isinstance(name, str) or name.strip() == "":
        return ""

    first_word = clean_input(name.strip().split()[0].title())

    if first_word in overrides:
        return overrides[first_word]

    try:
        phonemes = g2p(first_word)
        cleaned = [ph.strip('012') for ph in phonemes if ph != ' ']
        hebrew_chars = [phoneme_to_hebrew.get(ph, '') for ph in cleaned]
        hebrew = ''.join(hebrew_chars)
        hebrew = apply_final_forms(hebrew.strip())
        return hebrew if hebrew else first_word
    except Exception as e:
        print(f"Error transliterating '{name}': {e}")
        return first_word

# Main processing
def main():
    input_file = "C:\\Web Projects\\WW2JewishSoldiers - Postgres\\views\\NewMaster_NY.xlsx"
    output_file = "C:\\Web Projects\\WW2JewishSoldiers - Postgres\\views\\NewMaster_NY_Transliterate.xlsx"
    override_file = "C:\\Web Projects\\WW2JewishSoldiers - Postgres\\views\\name_overrides.csv"

    print("📥 Loading Excel file...")
    df = pd.read_excel(input_file)

    print("📘 Loading name overrides...")
    name_overrides = load_name_overrides(override_file)

    print("🔠 Starting transliteration...")
    g2p = G2p()

    # Apply transliteration to desired columns
    df['First Name (Hebrew)'] = df['First Name'].apply(lambda x: transliterate_to_hebrew(x, name_overrides, g2p))
    df['Last Name (Hebrew)'] = df['Last Name'].apply(lambda x: transliterate_to_hebrew(x, name_overrides, g2p))
    df['Hometown (Hebrew)'] = df['Hometown'].apply(lambda x: transliterate_to_hebrew(x, name_overrides, g2p))

    # Clean unnamed columns
    unnamed_cols = [col for col in df.columns if col.startswith('Unnamed:')]
    df.drop(columns=unnamed_cols, inplace=True)

    # Reorder Hebrew columns
    columns = list(df.columns)
    for field in ['First Name', 'Last Name', 'Hometown']:
        heb_col = f'{field} (Hebrew)'
        if field in columns:
            idx = columns.index(field)
            columns.insert(idx + 1, columns.pop(columns.index(heb_col)))
    df = df[columns]

    print(f"💾 Saving to {output_file}...")
    df.to_excel(output_file, index=False)
    print("✅ Done!")

if __name__ == "__main__":
    main()
