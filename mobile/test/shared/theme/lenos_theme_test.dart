import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lenos/shared/theme/theme.dart';
import 'package:lenos/shared/widgets/frosted_app_bar.dart';

void main() {
  group('LenOS theme catalog entries', () {
    test('both halves are in the catalog', () {
      expect(findTheme(lenosThemeName), isNotNull);
      expect(findTheme(lenosDarkThemeName), isNotNull);
    });

    test('borrow the GitHub palettes', () {
      final lenos = findTheme(lenosThemeName)!;
      final github = findTheme('github-light')!;
      expect(lenos.bg, github.bg);
      expect(lenos.fg, github.fg);
      expect(lenos.comment, github.comment);

      final lenosDark = findTheme(lenosDarkThemeName)!;
      final githubDark = findTheme('github-dark')!;
      expect(lenosDark.bg, githubDark.bg);
      expect(lenosDark.fg, githubDark.fg);
      expect(lenosDark.comment, githubDark.comment);
    });

    test('are a light/dark pair', () {
      expect(findTheme(lenosThemeName)!.isDark, isFalse);
      expect(findTheme(lenosDarkThemeName)!.isDark, isTrue);
      expect(themePairFor(lenosThemeName), lenosDarkThemeName);
      expect(themePairFor(lenosDarkThemeName), lenosThemeName);
    });

    test('appear as a single System-mode option labelled "LenOS"', () {
      final paired = themeGroups().paired.map((t) => t.name);
      expect(paired, contains(lenosThemeName));
      expect(paired, isNot(contains(lenosDarkThemeName)));
      expect(pairedThemeLabel(lenosThemeName), 'LenOS');
      expect(themeSelectionLabel(lenosThemeName, ThemeMode.system), 'LenOS');
      expect(themeSelectionLabel(lenosDarkThemeName, ThemeMode.system), 'LenOS');
    });

    test('resolve across brightnesses like any other pair', () {
      final resolved = resolveSchemes(lenosThemeName, ThemeMode.system);
      expect(resolved.forcedMode, isNull);
      expect(resolved.light.brightness, Brightness.light);
      expect(resolved.dark.brightness, Brightness.dark);
      expect(resolved.lightTheme?.name, lenosThemeName);
      expect(resolved.darkTheme?.name, lenosDarkThemeName);

      expect(
        effectiveTheme(lenosThemeName, ThemeMode.dark)?.name,
        lenosDarkThemeName,
      );
      expect(
        effectiveTheme(lenosDarkThemeName, ThemeMode.light)?.name,
        lenosThemeName,
      );
    });

    test(
      'fallbacks expose the effective LenOS theme for gradient selection',
      () {
        final coerced = resolveSchemes('nord', ThemeMode.light);
        expect(coerced.lightTheme?.name, lenosThemeName);
        expect(
          lenosTopSectionGradient(
            coerced.lightTheme!.name,
            coerced.light.brightness,
          ),
          isNotNull,
        );

        final unknown = resolveSchemes('not-a-theme', ThemeMode.light);
        expect(unknown.lightTheme?.name, lenosThemeName);
        expect(
          lenosTopSectionGradient(
            unknown.lightTheme!.name,
            unknown.light.brightness,
          ),
          isNotNull,
        );
      },
    );
  });

  group('lenosTopSectionGradient', () {
    test('is null for non-LenOS themes', () {
      expect(lenosTopSectionGradient('github-light', Brightness.light), isNull);
      expect(lenosTopSectionGradient('nord', Brightness.dark), isNull);
    });

    test('paints top to bottom for both halves of the pair', () {
      for (final name in [lenosThemeName, lenosDarkThemeName]) {
        final gradient = lenosTopSectionGradient(name, Brightness.light);
        expect(gradient, isNotNull, reason: '$name should be gradient-backed');
        expect(gradient!.begin, Alignment.topCenter);
        expect(gradient.end, Alignment.bottomCenter);
        expect(gradient.colors, hasLength(2));
      }
    });

    test('brightness selects the stops, not the theme name', () {
      // Both halves enable the gradient, so System mode keeps it on across an
      // OS switch — the applied brightness alone decides which stops are used.
      final light = lenosTopSectionGradient(lenosThemeName, Brightness.light)!;
      final dark = lenosTopSectionGradient(lenosThemeName, Brightness.dark)!;

      expect(light.colors, isNot(dark.colors));
      expect(
        lenosTopSectionGradient(lenosDarkThemeName, Brightness.dark)!.colors,
        dark.colors,
      );
      expect(
        lenosTopSectionGradient(lenosDarkThemeName, Brightness.light)!.colors,
        light.colors,
      );
    });

    test('is opaque so the color replaces the frosted fill', () {
      for (final brightness in Brightness.values) {
        final gradient = lenosTopSectionGradient(lenosThemeName, brightness)!;
        for (final color in gradient.colors) {
          expect(color.a, 1.0);
        }
      }
    });
  });

  group('theme threading', () {
    BoxDecoration barDecoration(WidgetTester tester) {
      final container = tester
          .widgetList<Container>(
            find.descendant(
              of: find.byType(FrostedAppBar),
              matching: find.byType(Container),
            ),
          )
          .first;
      return container.decoration! as BoxDecoration;
    }

    Widget harness(ThemeData theme) => MaterialApp(
      theme: theme,
      home: Builder(
        builder: (context) => Stack(
          children: [
            FrostedAppBar(
              gradient: context.appColors.topSectionGradient,
              title: const Text('Home'),
            ),
          ],
        ),
      ),
    );

    testWidgets('AppTheme carries the gradient to the top section', (
      tester,
    ) async {
      await tester.pumpWidget(
        harness(
          AppTheme.light(
            topSectionGradient: lenosTopSectionGradient(
              lenosThemeName,
              Brightness.light,
            ),
          ),
        ),
      );

      final decoration = barDecoration(tester);
      expect(decoration.gradient, isNotNull);
      // A BoxDecoration cannot paint a color and a gradient at once.
      expect(decoration.color, isNull);
    });

    testWidgets('non-LenOS themes keep the frosted surface fill', (
      tester,
    ) async {
      await tester.pumpWidget(harness(AppTheme.light()));

      final decoration = barDecoration(tester);
      expect(decoration.gradient, isNull);
      expect(decoration.color, isNotNull);
    });
  });

  group('isLenOSTheme', () {
    test('matches only the LenOS pair', () {
      expect(isLenOSTheme(lenosThemeName), isTrue);
      expect(isLenOSTheme(lenosDarkThemeName), isTrue);
      expect(isLenOSTheme('github-light'), isFalse);
      expect(isLenOSTheme(''), isFalse);
    });
  });
}
