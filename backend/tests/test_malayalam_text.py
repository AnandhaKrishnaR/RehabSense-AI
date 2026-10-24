from django.test import SimpleTestCase

from apps.voice.services.malayalam_text import (
    get_physio_voice_message,
    prepare_text_for_tts,
    segment_malayalam_text,
)


class MalayalamTextPreparationTests(SimpleTestCase):
    def test_known_repetition_count_uses_natural_malayalam(self):
        self.assertEqual(
            prepare_text_for_tts("Complete 5 reps"),
            "Complete അഞ്ച് ആവർത്തനങ്ങൾ.",
        )

    def test_single_repetition_uses_singular_form(self):
        self.assertEqual(
            prepare_text_for_tts("1 repetition"),
            "ഒരു ആവർത്തനം.",
        )

    def test_unknown_number_is_not_mechanically_transliterated(self):
        self.assertEqual(
            prepare_text_for_tts("Complete 21 repetitions"),
            "Complete 21 ആവർത്തനങ്ങൾ.",
        )

    def test_standalone_numbers_and_symptom_scores_are_preserved(self):
        self.assertEqual(prepare_text_for_tts("Pain score: 7."), "വേദനയുടെ അളവ്: 7.")

    def test_explicit_vas_ratio_is_spoken_as_malayalam(self):
        self.assertEqual(
            prepare_text_for_tts("വേദന 7/10 ആയി"),
            "വേദന പത്തിൽ ഏഴ് ആയി.",
        )

    def test_duration_in_minutes_is_normalized_only_with_known_unit(self):
        self.assertEqual(prepare_text_for_tts("Rest for 2 minutes"), "Rest for രണ്ട് മിനിറ്റ്.")
        self.assertEqual(prepare_text_for_tts("ഇനി 2 മിനിറ്റ് വിശ്രമിക്കുക"), "ഇനി രണ്ട് മിനിറ്റ് വിശ്രമിക്കുക.")

    def test_long_punctuation_free_sentence_splits_at_word_boundaries(self):
        text = "കൈ പതുക്കെ മുന്നിലേക്ക് ഉയർത്തുക വേദനയുണ്ടെങ്കിൽ ഉടൻ നിർത്തുക"
        segments = segment_malayalam_text(text, max_segment_chars=20)

        self.assertGreater(len(segments), 1)
        self.assertTrue(all(len(segment) <= 20 for segment in segments))
        self.assertEqual(" ".join(segments), text)

    def test_repetition_template_uses_singular_and_plural_units(self):
        self.assertTrue(get_physio_voice_message("rep_completed", 1).startswith("ഒന്ന് ആവർത്തനം"))
        self.assertTrue(get_physio_voice_message("rep_completed", 5).startswith("അഞ്ച് ആവർത്തനങ്ങൾ"))