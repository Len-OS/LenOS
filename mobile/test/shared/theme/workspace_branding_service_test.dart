import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lenos/shared/theme/workspace_branding_service.dart';

void main() {
  test('parseAccentColor returns null for null input', () {
    expect(parseAccentColor(null), isNull);
  });

  test('parseAccentColor returns null for invalid hex', () {
    expect(parseAccentColor('notacolor'), isNull);
    expect(parseAccentColor('#gg0000'), isNull);
    expect(parseAccentColor('#12345'), isNull);
  });

  test('parseAccentColor returns Color for valid 6-digit hex', () {
    final color = parseAccentColor('#5b4fcf');
    expect(color, isNotNull);
    expect(color, equals(const Color(0xFF5B4FCF)));
  });

  test('parseAccentColor handles uppercase hex', () {
    final color = parseAccentColor('#FF0000');
    expect(color, isNotNull);
    expect(color, equals(const Color(0xFFFF0000)));
  });

  test('WorkspaceBranding defaults are null', () {
    const branding = WorkspaceBranding(avatar: null, accentColor: null);
    expect(branding.avatar, isNull);
    expect(branding.accentColor, isNull);
  });
}
