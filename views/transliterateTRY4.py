import pandas as pd
import re
import requests
import argparse
from g2p_en import G2p
from googletrans import Translator

# Load name overrides from CSV
def load_name_overrides(file_path='name_overrides.csv'):
    try:
        df = pd.read_csv(file_path)
        return dict(zip(df['English'].str.strip().str.title(), df['Hebrew'].str.strip()))
    except Exception as e:
        print(f"⚠️ Error loading name overrides: {e}")
        return {}

# ARPAbet phoneme to Hebrew mapping
phoneme_to_hebrew = {
    'A': 'אַ', 'AA': 'אַ', 'AE': 'ע', 'AH': 'ה', 'AO': 'או',
    'AW': 'או', 'AY': 'אֵי', 'B': 'ב', 'CH': 'צ׳',
    'D': 'ד', 'DH': 'ד׳', 'E': 'ע', 'EH': 'אֶ', 'ER': 'ר', 'EY': 'אֵי',
    'F': 'פ', 'G': 'ג', 'HH': 'ה', 'IH': 'י', 'IY': 'י',
    'JH': 'ג׳', 'K': 'ק', 'L': 'ל', 'M': 'מ', 'N': 'נ', 'NG': 'נג',
    'OW': 'וֹ', 'OY': 'וי', 'P': 'פ', 'R': 'ר', 'S': 'ס',
    'SH': 'ש', 'T': 'ט', 'TH': 'ת׳', 'UH': 'וּ', 'UW': 'וּ',
    'V': 'ו', 'W': 'ו', 'Y': 'י', 'Z': 'ז', 'ZH': 'ז׳', ' ': ' '
}

# Final Hebrew letter forms
final_letter_map = {
    'מ': 'ם',
    'נ': 'ן',
    'צ': 'ץ',
    'פ': 'ף',
    'כ': 'ך'
}

# Clean punctuation
def clean_input(word):
    return re.sub(r'[^\w\s]', '', word)

# Final Hebrew letter adjustment
def apply_final_forms(hebrew_word):
    if not hebrew_word:
        return hebrew_word
    last_char = hebrew_word[-1]
    return hebrew_word[:-1] + final_letter_map.get(last_char, last_char)

# Method 1: Phoneme-based transliteration
def transliterate_phoneme(name, overrides, g2p):
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
        return apply_final_forms(hebrew.strip()) if hebrew else first_word
    except Exception as e:
        print(f"Error transliterating '{name}': {e}")
        return first_word

# Method 2: API-based transliteration using LibreTranslate
def transliterate_api(name):
    url = "https://libretranslate.com/translate"
    payload = {
        'q': name,
        'source': 'en',
        'target': 'he',
        'format': 'text'
    }
    try:
        response = requests.post(url, data=payload, timeout=10)
        response.raise_for_status()
        result = response.json()
        return result.get('translatedText', name)
    except requests.exceptions.RequestException as e:
        print(f"🌐 API error for '{name}': {e}")
        return name

# Method 3: Google Translate via googletrans package
def transliterate_google(name, translator):
    try:
        # Translate text to Hebrew (language code 'he')
        translated = translator.translate(name, src='en', dest='he')
        return translated.text
    except Exception as e:
        print(f"🌐 Google Translate error for '{name}': {e}")
        return name

# Wrapper function to select method
def transliterate(name, overrides, g2p, method="phoneme", translator=None):
    if method == "api":
        return transliterate_api(name)
    elif method == "google":
        if translator is None:
            raise ValueError("Translator instance required for google method")
        return transliterate_google(name, translator)
    else:
        return transliterate_phoneme(name, overrides, g2p)

# Main processing
def main():
    parser = argparse.ArgumentParser(description="Transliterate English to Hebrew using phonemes, API, or Google Translate.")
    parser.add_argument('--method', choices=['phoneme', 'api', 'google'], default='phoneme', help='Transliteration method')
    args = parser.parse_args()

    input_file = "C:\\Web Projects\\WW2JewishSoldiers - Postgres\\views\\NewMaster_NY.xlsx"
    output_file = "C:\\Web Projects\\WW2JewishSoldiers - Postgres\\views\\NewMaster_NY_Transliterate.xlsx"
    override_file = "C:\\Web Projects\\WW2JewishSoldiers - Postgres\\views\\name_overrides.csv"

    print("📥 Loading Excel file...")
    df = pd.read_excel(input_file)

    print("📘 Loading name overrides...")
    name_overrides = load_name_overrides(override_file)

    print(f"🔠 Starting transliteration using method: {args.method}")

    g2p = G2p() if args.method == 'phoneme' else None
    translator = Translator() if args.method == 'google' else None

    df['First Name (Hebrew)'] = df['First Name'].apply(lambda x: transliterate(x, name_overrides, g2p, method=args.method, translator=translator))
    df['Last Name (Hebrew)'] = df['Last Name'].apply(lambda x: transliterate(x, name_overrides, g2p, method=args.method, translator=translator))
    df['Hometown (Hebrew)'] = df['Hometown'].apply(lambda x: transliterate(x, name_overrides, g2p, method=args.method, translator=translator))

    unnamed_cols = [col for col in df.columns if col.startswith('Unnamed:')]
    df.drop(columns=unnamed_cols, inplace=True)

    # Reorder Hebrew columns to appear right after the original columns
    columns = list(df.columns)
    for field in ['First Name', 'Last Name', 'Hometown']:
        heb_col = f'{field} (Hebrew)'
        if field in columns and heb_col in columns:
            idx = columns.index(field)
            columns.insert(idx + 1, columns.pop(columns.index(heb_col)))
    df = df[columns]

    print(f"💾 Saving to {output_file}...")
    df.to_excel(output_file, index=False)
    print("✅ Done!")

if __name__ == "__main__":
    main()

