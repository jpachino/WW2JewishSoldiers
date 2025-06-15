import pandas as pd
from g2p_en import G2p

# Load name overrides from CSV
def load_name_overrides(file_path='name_overrides.csv'):
    try:
        df = pd.read_csv(file_path)
        return dict(zip(df['English'].str.strip().str.title(), df['Hebrew'].str.strip()))
    except Exception as e:
        print(f"⚠️ Error loading name overrides: {e}")
        return {}

# ARPAbet phoneme to Hebrew map (basic)
phoneme_to_hebrew = {
    'AA': 'אַ', 'AE': 'אֵ', 'AH': 'אַ', 'AO': 'אוֹ',
    'AW': 'אַו', 'AY': 'אַי', 'B': 'ב', 'CH': 'צ׳',
    'D': 'ד', 'DH': 'ד׳', 'EH': 'אֶ', 'ER': 'אֶר', 'EY': 'אֵי',
    'F': 'פ', 'G': 'ג', 'HH': 'ה', 'IH': 'אִ', 'IY': 'אִי',
    'JH': 'ג׳', 'K': 'ק', 'L': 'ל', 'M': 'מ', 'N': 'נ', 'NG': 'נְג',
    'OW': 'אוֹ', 'OY': 'אוֹי', 'P': 'פ', 'R': 'ר', 'S': 'ס',
    'SH': 'ש', 'T': 'ט', 'TH': 'ת׳', 'UH': 'אוּ', 'UW': 'אוּ',
    'V': 'ו', 'W': 'ו', 'Y': 'י', 'Z': 'ז', 'ZH': 'ז׳', ' ': ' '
}

# Function to transliterate one English name (or word) to Hebrew
def transliterate_to_hebrew(name, overrides, g2p):
    if not isinstance(name, str) or name.strip() == "":
        return ""

    # Use only the first word (first token) for transliteration
    first_word = name.strip().split()[0].title()

    # Check overrides first
    if first_word in overrides:
        return overrides[first_word]

    # Fallback: phoneme-based transliteration
    try:
        phonemes = g2p(first_word)
        cleaned = [ph.strip('012') for ph in phonemes if ph != ' ']
        hebrew_chars = [phoneme_to_hebrew.get(ph, '') for ph in cleaned]
        hebrew = ''.join(hebrew_chars)
        if hebrew.strip() == "":
            # If no phonemes matched, fallback to original English word as placeholder
            return first_word
        return hebrew
    except Exception as e:
        print(f"Error transliterating '{name}': {e}")
        return first_word  # fallback to original if error

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

    # Transliterate First Name, Last Name, and now Hometown
    df['First Name (Hebrew)'] = df['First Name'].apply(lambda x: transliterate_to_hebrew(x, name_overrides, g2p))
    df['Last Name (Hebrew)'] = df['Last Name'].apply(lambda x: transliterate_to_hebrew(x, name_overrides, g2p))
    df['Hometown (Hebrew)'] = df['Hometown'].apply(lambda x: transliterate_to_hebrew(x, name_overrides, g2p))

    # Remove empty "Unnamed:" columns to clean output
    unnamed_cols = [col for col in df.columns if col.startswith('Unnamed:')]
    df.drop(columns=unnamed_cols, inplace=True)

    # Reorder columns to put Hebrew fields right after originals
    columns = list(df.columns)
    # Remove Hebrew columns temporarily
    columns.remove('First Name (Hebrew)')
    columns.remove('Last Name (Hebrew)')
    columns.remove('Hometown (Hebrew)')

    first_idx = columns.index('First Name')
    last_idx = columns.index('Last Name')
    hometown_idx = columns.index('Hometown')

    columns.insert(first_idx + 1, 'First Name (Hebrew)')
    columns.insert(last_idx + 2, 'Last Name (Hebrew)')
    columns.insert(hometown_idx + 1, 'Hometown (Hebrew)')

    df = df[columns]

    print(f"💾 Saving to {output_file}...")
    df.to_excel(output_file, index=False)
    print("✅ Done!")

if __name__ == "__main__":
    main()
