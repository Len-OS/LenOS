import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:nostr/nostr.dart' as nostr;
import 'package:package_info_plus/package_info_plus.dart';

import 'package:url_launcher/url_launcher.dart';

import '../../shared/auth/auth.dart';
import '../../shared/clipboard_utils.dart';
import '../../shared/relay/relay.dart';
import '../../shared/theme/theme.dart';
import '../../shared/widgets/app_list.dart';
import '../../shared/widgets/app_list_card.dart';
import '../../shared/widgets/frosted_app_bar.dart';
import '../../shared/widgets/frosted_scaffold.dart';
import 'accent_picker_page.dart';
import 'theme_picker_page.dart';

part 'settings_page/appearance_section.dart';
part 'settings_page/connection_section.dart';

class SettingsPage extends HookConsumerWidget {
  const SettingsPage({super.key, required this.profileHeader});

  final Widget profileHeader;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final packageInfoFuture = useMemoized(() => PackageInfo.fromPlatform());
    final packageInfo = useFuture(packageInfoFuture);

    return FrostedScaffold(
      appBar: const FrostedAppBar(title: Text('Settings')),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: EdgeInsets.only(
                top: frostedAppBarHeight(context),
                bottom: Grid.xs,
              ),
              children: [
                profileHeader,
                const _AppearanceSection(),
                const _LenGrowthSection(),
                const _IntegrationsSection(),
                const _AutomationsSection(),
                const _ConnectionSection(),
                const _RemoveCommunitySection(),
              ],
            ),
          ),
          if (packageInfo.hasData)
            _VersionFooter(version: packageInfo.data!.version),
        ],
      ),
    );
  }
}

class _LenGrowthSection extends StatelessWidget {
  const _LenGrowthSection();

  static final _dashboardUrl = Uri.parse(
    const String.fromEnvironment(
      'DASHBOARD_URL',
      defaultValue: 'https://dashboard.lengrowth.com',
    ),
  );

  @override
  Widget build(BuildContext context) {
    return AppListCard(
      label: 'LenGrowth',
      children: [
        AppListRow(
          icon: LucideIcons.externalLink,
          title: 'Advanced Dashboard',
          trailing: const _RowChevron(),
          onTap: () => launchUrl(
            _dashboardUrl,
            mode: LaunchMode.externalApplication,
          ),
        ),
      ],
    );
  }
}

class _IntegrationsSection extends StatelessWidget {
  const _IntegrationsSection();

  static final _integrationsUrl = Uri.parse(
    '${const String.fromEnvironment('LENOS_WEB_URL', defaultValue: 'https://app.lengrowth.com')}/settings?tab=integrations',
  );

  @override
  Widget build(BuildContext context) {
    return AppListCard(
      label: 'Integrations',
      children: [
        AppListRow(
          icon: LucideIcons.externalLink,
          title: 'GitHub',
          subtitle: 'Manage on web',
          trailing: const _RowChevron(),
          onTap: () => launchUrl(_integrationsUrl, mode: LaunchMode.externalApplication),
        ),
        AppListRow(
          icon: LucideIcons.externalLink,
          title: 'Notion',
          subtitle: 'Manage on web',
          trailing: const _RowChevron(),
          onTap: () => launchUrl(_integrationsUrl, mode: LaunchMode.externalApplication),
        ),
        AppListRow(
          icon: LucideIcons.externalLink,
          title: 'Linear',
          subtitle: 'Manage on web',
          trailing: const _RowChevron(),
          onTap: () => launchUrl(_integrationsUrl, mode: LaunchMode.externalApplication),
        ),
        AppListRow(
          icon: LucideIcons.externalLink,
          title: 'Slack',
          subtitle: 'Manage on web',
          trailing: const _RowChevron(),
          onTap: () => launchUrl(_integrationsUrl, mode: LaunchMode.externalApplication),
        ),
      ],
    );
  }
}

class _AutomationsSection extends StatelessWidget {
  const _AutomationsSection();

  static final _automationsUrl = Uri.parse(
    '${const String.fromEnvironment('LENOS_WEB_URL', defaultValue: 'https://app.lengrowth.com')}/settings?tab=automations',
  );

  @override
  Widget build(BuildContext context) {
    return AppListCard(
      label: 'Automations',
      children: [
        AppListRow(
          icon: LucideIcons.externalLink,
          title: 'Manage Automations',
          subtitle: 'View and cancel recurring tasks on web',
          trailing: const _RowChevron(),
          onTap: () => launchUrl(_automationsUrl, mode: LaunchMode.externalApplication),
        ),
      ],
    );
  }
}

class _VersionFooter extends StatelessWidget {
  const _VersionFooter({required this.version});

  final String version;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.only(bottom: Grid.xs, top: Grid.xxs),
        child: Center(
          child: Text(
            'v$version',
            style: context.textTheme.bodySmall?.copyWith(
              color: context.colors.onSurfaceVariant.withValues(alpha: 0.6),
            ),
          ),
        ),
      ),
    );
  }
}

/// Trailing affordance shared by the rows that push a picker page.
class _RowChevron extends StatelessWidget {
  const _RowChevron();

  @override
  Widget build(BuildContext context) {
    return Icon(
      LucideIcons.chevronRight,
      size: 18,
      color: context.colors.onSurfaceVariant,
    );
  }
}
