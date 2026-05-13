// WebShell — desktop-web обёртка: top-nav + max-width контейнер.
//
// Активна только при Platform.OS === "web" && width >= 768.
// На mobile / narrow web компонент не используется (см. (tabs)/_layout.tsx).

import { Link, usePathname, useRouter } from "expo-router";
import { ClipboardList, Home, MessageCircle, Moon, Sun, User } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useThemeColors } from "@/lib/use-theme-color";

interface WebShellProps {
  children: React.ReactNode;
  chatsBadge?: string;
  ordersBadge?: string;
}

interface NavItem {
  href: "/(tabs)" | "/(tabs)/orders" | "/(tabs)/chats" | "/(tabs)/profile";
  match: string;
  label: string;
  icon: typeof Home;
  badge?: string;
}

export function WebShell({ children, chatsBadge, ordersBadge }: WebShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const tc = useThemeColors(["ink", "muted", "on-primary", "error"]);
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const { colorScheme, preference, setPreference } = useColorScheme();

  const navItems: NavItem[] = [
    { href: "/(tabs)", match: "/", label: "Главная", icon: Home },
    {
      href: "/(tabs)/orders",
      match: "/orders",
      label: "Заказы",
      icon: ClipboardList,
      badge: ordersBadge,
    },
    {
      href: "/(tabs)/chats",
      match: "/chats",
      label: "Чаты",
      icon: MessageCircle,
      badge: chatsBadge,
    },
  ];

  const isActive = (match: string): boolean => {
    if (match === "/") return pathname === "/" || pathname === "/(tabs)";
    return pathname.startsWith(match);
  };

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Профиль";

  const toggleTheme = () => {
    if (preference === "system") {
      setPreference(colorScheme === "dark" ? "light" : "dark");
    } else {
      setPreference(preference === "dark" ? "light" : "dark");
    }
  };

  return (
    <View className="flex-1 bg-canvas">
      {/* Top-nav */}
      <View className="border-hairline border-b bg-canvas">
        <View
          className="mx-auto w-full flex-row items-center justify-between px-8 py-3"
          style={{ maxWidth: 1120 }}
        >
          {/* Logo + brand */}
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push("/(tabs)")}
            className="hover:opacity-70"
          >
            <AppText weight="display" className="text-title-lg tracking-tight text-ink">
              xtrud
            </AppText>
          </Pressable>

          {/* Nav links */}
          <View className="flex-row items-center gap-1">
            {navItems.map((item) => {
              const active = isActive(item.match);
              const Icon = item.icon;
              return (
                <Link key={item.match} href={item.href} asChild>
                  <Pressable
                    accessibilityRole="link"
                    className={`flex-row items-center gap-2 rounded-md px-3 py-2 hover:bg-surface-2 ${
                      active ? "bg-surface-2" : ""
                    }`}
                  >
                    <Icon size={18} strokeWidth={1.75} color={active ? tc.ink : tc.muted} />
                    <AppText
                      weight={active ? "semibold" : "medium"}
                      className={`text-body-sm ${active ? "text-ink" : "text-muted"}`}
                    >
                      {item.label}
                    </AppText>
                    {item.badge && (
                      <View
                        className="min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5"
                        style={{ backgroundColor: tc.error }}
                      >
                        <AppText
                          weight="bold"
                          className="text-caption-xs"
                          style={{ color: tc["on-primary"] }}
                        >
                          {item.badge}
                        </AppText>
                      </View>
                    )}
                  </Pressable>
                </Link>
              );
            })}
          </View>

          {/* Theme toggle + avatar */}
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Переключить тему"
              onPress={toggleTheme}
              className="h-9 w-9 items-center justify-center rounded-md hover:bg-surface-2"
            >
              {colorScheme === "dark" ? (
                <Sun size={18} strokeWidth={1.75} color={tc.ink} />
              ) : (
                <Moon size={18} strokeWidth={1.75} color={tc.ink} />
              )}
            </Pressable>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={fullName}
              onPress={() => router.push("/(tabs)/profile")}
              className="rounded-full hover:opacity-70"
            >
              {user?.avatar_url ? (
                <Avatar url={user.avatar_url} name={fullName} seed={user.id} size="sm" />
              ) : (
                <View className="h-9 w-9 items-center justify-center rounded-full border border-hairline bg-surface-2">
                  <User size={18} strokeWidth={1.75} color={tc.ink} />
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {/* Main content with max-width */}
      <View className="flex-1">
        <View className="mx-auto w-full flex-1" style={{ maxWidth: 1120 }}>
          {children}
        </View>
      </View>
    </View>
  );
}
