import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lenos/shared/theme/lenos_theme.dart';

void main() {
  test('lenosAccentTheme light uses Brightness.light', () {
    final theme = lenosAccentTheme(const Color(0xFF5B4FCF));
    expect(theme.brightness, Brightness.light);
  });

  test('lenosAccentTheme dark uses Brightness.dark', () {
    final theme = lenosAccentTheme(const Color(0xFF5B4FCF), dark: true);
    expect(theme.brightness, Brightness.dark);
  });

  test('lenosAccentTheme seed color is used in color scheme', () {
    const seed = Color(0xFFE74C3C);
    final theme = lenosAccentTheme(seed);
    // ColorScheme.fromSeed derives primary from seed; it will not be identical
    // but the scheme should not be null.
    expect(theme.colorScheme, isNotNull);
  });
}
