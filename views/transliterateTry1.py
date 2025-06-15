import pandas as pd
import eng_to_ipa as ipa

IPA_TO_HEBREW = {
    'ɑ': 'א', 'æ': 'אַ', 'ə': 'ע', 'ʌ': 'אַ', 'ɛ': 'אֶ',
    'ɪ': 'אִ', 'i': 'י', 'iː': 'י', 'eɪ': 'אֵי', 'aɪ': 'אי',
    'oʊ': 'אוֹ', 'u': 'וּ', 'uː': 'וּ', 'aʊ': 'אוּ', 'ɔɪ': 'אוֹי',
    'p': 'פ', 'b': 'ב', 't': 'ט', 'd': 'ד', 'k': 'ק', 'g': 'ג',
    'f': 'פ', 'v': 'ו', 'θ': 'ת׳', 'ð': 'ד׳', 's': 'ס', 'z': 'ז',
    'ʃ': 'ש', 'ʒ': 'ז׳', 'h': 'ה', 'm': 'מ', 'n': 'נ', 'ŋ': 'נג',
    'l': 'ל', 'r': 'ר', 'j': 'י', 'w': 'ו',
    'tʃ': 'צ׳', 'dʒ': 'ג׳',
    ' ': ' ', '.': '', ',': '', "'": '', '-': '-', ':': '', ';': ''
}

FALLBACK_MAP = {
    'a': 'א', 'b': 'ב', 'c': 'ק', 'd': 'ד', 'e': 'א',
    'f': 'פ', 'g': 'ג', 'h': 'ה', 'i': 'י', 'j': 'ג׳', 'k': 'ק',
    'l': 'ל', 'm': 'מ', 'n': 'נ', 'o': 'ו', 'p': 'פ', 'q': 'ק',
    'r': 'ר', 's': 'ס', 't': 'ט', 'u': 'ו', 'v': 'ו', 'w': 'וו',
    'x': 'קס', 'y': 'י', 'z': 'ז'
}

def transliterate_to_hebrew_advanced(text: str) -> str:
    text = text.lower().strip()
    ipa_text = ipa.convert(text)
    if not ipa_text:
        return ''.join(FALLBACK_MAP.get(c, c) for c in text)
    output = ''
    i = 0
    while i < len(ipa_text):
        if i + 2 < len(ipa_text) and ipa_text[i:i+3] in IPA_TO_HEBREW:
            output += IPA_TO_HEBREW[ipa_text[i:i+3]]
            i += 3
            continue
        if i + 1 < len(ipa_text) and ipa_text[i:i+2] in IPA_TO_HEBREW:
            output += IPA_TO_HEBREW[ipa_text[i:i+2]]
            i += 2
            continue
        if ipa_text[i] in IPA_TO_HEBREW:
            output += IPA_TO_HEBREW[ipa_text[i]]
        else:
            output += ipa_text[i]
        i += 1
    return output

def main():
    input_excel =  "C:\\Web Projects\\WW2JewishSoldiers - Postgres\\views\\NewMaster_NY.xlsx"

    output_excel =  "C:\\Web Projects\\WW2JewishSoldiers - Postgres\\views\\NewMaster_NY_transliterated.xlsx"

    df = pd.read_excel(input_excel)
    
    # Transliterate each field separately
    df['Transliterated Last Name'] = df['Last Name'].apply(transliterate_to_hebrew_advanced)
    df['Transliterated First Name'] = df['First Name'].apply(transliterate_to_hebrew_advanced)
    
    # Combine Last + First for full name, then transliterate
    df['Full Name'] = df['Last Name'] + ' ' + df['First Name']
    df['Transliterated Full Name'] = df['Full Name'].apply(transliterate_to_hebrew_advanced)
    
    df.to_excel(output_excel, index=False)
    print(f"Transliteration done! Output saved to '{output_excel}'")

if __name__ == "__main__":
    main()

