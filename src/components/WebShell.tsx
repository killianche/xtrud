// WebShell — desktop-web обёртка: top-nav + max-width контейнер.
//
// Активна только при Platform.OS === "web" && width >= 768.
// На mobile / narrow web компонент не используется (см. (tabs)/_layout.tsx).

import { Link, usePathname, useRouter } from "expo-router";
import { ClipboardText, House, ChatCircle, MagnifyingGlass, Moon, Sun, SignIn } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { CitySelector } from "@/components/CitySelector";
import { XtrudLogo } from "@/components/XtrudLogo";
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
  href: "/(tabs)" | "/(tabs)/orders" | "/(tabs)/orders/search" | "/(tabs)/chats" | "/(tabs)/profile";
  match: string;
  label: string;
  icon: typeof House;
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

  // Ссылки разные для двух ролей:
  //   - client: Главная / Заказы / Чаты — «Заказы» это его собственные заявки.
  //   - master: Главная / Поиск заказов / Чаты — «Поиск» это лента всех
  //     open-заявок (route /orders/search). На mobile это центральный таб
  //     TabBar (фидбэк user 2026-05-15: «отдельная кнопка поиск в нижнем меню»);
  //     на desktop эту кнопку забыли вынести в WebShell (фидбэк user 2026-05-16:
  //     «в хедре у компьютерной версии не бывает кнопок поиска заказов»).
  //     Теперь и там, и там есть.
  const isMasterRole = user?.active_role === "master";
  const navItems: NavItem[] = [
    // Главная использует фирменный логотип xtrud вместо House.
    // icon-поле остаётся House как fallback-тип, но в render-цикле
    // ниже первый item (match='/') рендерится через XtrudLogo.
    { href: "/(tabs)", match: "/", label: "Главная", icon: House },
    ...(isMasterRole
      ? [
          {
            href: "/(tabs)/orders/search" as const,
            match: "/orders/search",
            label: "Поиск заказов",
            icon: MagnifyingGlass,
          },
        ]
      : [
          {
            href: "/(tabs)/orders" as const,
            match: "/orders",
            label: "Заказы",
            icon: ClipboardText,
            badge: ordersBadge,
          },
        ]),
    {
      href: "/(tabs)/chats",
      match: "/chats",
      label: "Чаты",
      icon: ChatCircle,
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
          {/* Brand-mark — XtrudLogo (тот же что в TabBar для главной).
              Раньше был текст «xtrud» — но он дублировался с hero-page
              где «xtrud»+локация (фидбек user 2026-05-16: «xtrud 2 раза
              написано»). Теперь WebShell использует только icon как
              app-shell brand, а page hero оставляет полный «xtrud». */}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="На главную"
            onPress={() => router.push("/(tabs)")}
            className="hover:opacity-70"
          >
            <XtrudLogo size={28} color={tc.ink} />
          </Pressable>

          {/* Nav links */}
          <View className="flex-row items-center gap-1">
            {navItems.map((item) => {
              const active = isActive(item.match);
              const Icon = item.icon;
              const isHome = item.match === "/";
              return (
                <Link key={item.match} href={item.href} asChild>
                  <Pressable
                    accessibilityRole="link"
                    className={`flex-row items-center gap-2 rounded-md px-3 py-2 hover:bg-surface-2 ${
                      active ? "bg-surface-2" : ""
                    }`}
                  >
                    {isHome ? (
                      <XtrudLogo size={18} color={active ? tc.ink : tc.muted} />
                    ) : (
                      <Icon size={18} weight="bold" color={active ? tc.ink : tc.muted} />
                    )}
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

          {/* Right actions: theme + city + auth (Войти если анон, аватар если
              авторизован). Раньше тут были только theme + avatar; CitySelector
              и «Войти» жили внутри страниц (TopBar в home, ScreenHeader rightActions
              в category). На desktop это дублировало хедер — выглядело как 2
              этажа nav-а. Перенесли city/auth в WebShell, страницы теперь не
              рисуют свой top-bar при isDesktopWeb. */}
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Переключить тему"
              onPress={toggleTheme}
              className="h-9 w-9 items-center justify-center rounded-md hover:bg-surface-2"
            >
              {colorScheme === "dark" ? (
                <Sun size={18} weight="bold" color={tc.ink} />
              ) : (
                <Moon size={18} weight="bold" color={tc.ink} />
              )}
            </Pressable>
            <CitySelector />
            {userId ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={fullName}
                onPress={() => router.push("/(tabs)/profile")}
                className="rounded-full hover:opacity-70"
              >
                <Avatar
                  url={user?.avatar_url ?? null}
                  name={fullName}
                  seed={user?.id ?? userId}
                  size="sm"
                />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Войти"
                onPress={() => router.push("/(auth)/phone" as never)}
                className="h-11 flex-row items-center gap-1.5 rounded-pill border px-4 active:opacity-70 border-hairline bg-canvas hover:bg-surface-2"
              >
                <SignIn size={16} weight="bold" color={tc.ink} />
                <AppText weight="semibold" className="text-button text-ink">
                  Войти
                </AppText>
              </Pressable>
            )}
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
