import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:nostr/nostr.dart';

const _kindCommunityDefinition = 9002;

class WorkspaceBranding {
  final String? avatar;
  final Color? accentColor;

  const WorkspaceBranding({required this.avatar, required this.accentColor});
}

/// Parse a 6-digit hex color string (#rrggbb) to a Flutter [Color].
/// Returns null if the input is null or not a valid hex color.
Color? parseAccentColor(String? hex) {
  if (hex == null) return null;
  final match = RegExp(r'^#([0-9a-fA-F]{6})$').firstMatch(hex);
  if (match == null) return null;
  return Color(int.parse('FF${match.group(1)!}', radix: 16));
}

class WorkspaceBrandingNotifier extends Notifier<WorkspaceBranding> {
  // Unsubscribe callback returned by session.subscribe() — same pattern as
  // observer_subscription.dart which stores it as a VoidCallback.
  void Function()? _unsubscribe;

  @override
  WorkspaceBranding build() {
    ref.onDispose(() {
      _unsubscribe?.call();
      _unsubscribe = null;
    });
    return const WorkspaceBranding(avatar: null, accentColor: null);
  }

  /// Subscribe to kind 9002 events for [communityId] using [session].
  /// Previous subscription is cancelled before starting a new one.
  Future<void> subscribe(dynamic session, String communityId) async {
    _unsubscribe?.call();
    _unsubscribe = null;

    int latestCreatedAt = -1;

    try {
      // session.subscribe follows the pattern in observer_subscription.dart:
      // it returns a VoidCallback (the unsubscribe function).
      // ignore: avoid_dynamic_calls
      final unsub = await session.subscribe(
        NostrFilter(
          kinds: [_kindCommunityDefinition],
          tags: {'#h': [communityId]},
          limit: 1,
        ),
        (Event event) {
          if (event.createdAt <= latestCreatedAt) return;
          latestCreatedAt = event.createdAt;

          final tags = event.tags;
          String? picture;
          String? color;
          for (final tag in tags) {
            if (tag.isNotEmpty && tag[0] == 'picture' && tag.length > 1) {
              picture = tag[1];
            }
            if (tag.isNotEmpty && tag[0] == 'color' && tag.length > 1) {
              color = tag[1];
            }
          }

          state = WorkspaceBranding(
            avatar: picture,
            accentColor: parseAccentColor(color),
          );
        },
      );
      if (unsub is void Function()) {
        _unsubscribe = unsub;
      }
    } catch (_) {
      // Relay unreachable — keep last branding.
    }
  }
}

final workspaceBrandingProvider =
    NotifierProvider<WorkspaceBrandingNotifier, WorkspaceBranding>(
  WorkspaceBrandingNotifier.new,
);
