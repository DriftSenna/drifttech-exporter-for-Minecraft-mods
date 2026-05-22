import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/hooks/useApi";

export default function AccountScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token, loading, login, register, logout } = useAuth();
  const { get } = useApi();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: backupData } = useQuery<{ backups: any[] }>({
    queryKey: ["backups"],
    queryFn: () => get<{ backups: any[] }>("/api/backups"),
    enabled: !!user,
  });

  const s = makeStyles(colors);

  if (loading) {
    return (
      <View style={[s.root, { paddingTop: topPad }]}>
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (user) {
    return (
      <View style={[s.root, { paddingTop: topPad + 16 }]}>
        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: botPad + 100 }]}>
          <Text style={s.heading}>Account</Text>

          <View style={s.profileCard}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{user.username[0].toUpperCase()}</Text>
            </View>
            <View>
              <Text style={s.username}>{user.username}</Text>
              <Text style={s.userMeta}>Signed in</Text>
            </View>
          </View>

          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statValue}>{backupData?.backups?.length ?? "—"}</Text>
              <Text style={s.statLabel}>Backups</Text>
            </View>
          </View>

          <Text style={s.sectionLabel}>Cloud Backup</Text>
          <View style={s.infoCard}>
            <View style={s.infoRow}>
              <Feather name="info" size={14} color={colors.mutedForeground} />
              <Text style={s.infoText}>
                Go to Library and tap a mod to create a backup. Backups are stored on the server and accessible from any device.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={s.logoutBtn}
            onPress={() => {
              Alert.alert("Sign out", "Are you sure you want to sign out?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Sign out",
                  style: "destructive",
                  onPress: () => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    logout();
                  },
                },
              ]);
            }}
          >
            <Feather name="log-out" size={16} color={colors.destructive} />
            <Text style={s.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: topPad + 16 }]}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: botPad + 100 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.heading}>Account</Text>
        <Text style={s.sub}>Sign in to back up and restore your mods from any device</Text>
        <AuthForm colors={colors} login={login} register={register} s={s} />
      </ScrollView>
    </View>
  );
}

function AuthForm({
  colors,
  login,
  register,
  s,
}: {
  colors: ReturnType<typeof useColors>;
  login: (u: string, p: string) => Promise<void>;
  register: (u: string, p: string) => Promise<void>;
  s: ReturnType<typeof makeStyles>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.authCard}>
      <View style={s.modeSwitcher}>
        <TouchableOpacity
          style={[s.modeBtn, mode === "login" && s.modeBtnActive]}
          onPress={() => { setMode("login"); setError(null); }}
        >
          <Text style={[s.modeBtnText, mode === "login" && s.modeBtnTextActive]}>Sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modeBtn, mode === "register" && s.modeBtnActive]}
          onPress={() => { setMode("register"); setError(null); }}
        >
          <Text style={[s.modeBtnText, mode === "register" && s.modeBtnTextActive]}>Create account</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={s.authInput}
        value={username}
        onChangeText={setUsername}
        placeholder="Username"
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />
      <TextInput
        style={s.authInput}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={colors.mutedForeground}
        secureTextEntry
        editable={!busy}
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />

      {error ? <Text style={s.authError}>{error}</Text> : null}

      <TouchableOpacity
        style={[s.authSubmit, busy && s.authSubmitDisabled]}
        onPress={handleSubmit}
        disabled={busy || !username.trim() || !password}
      >
        {busy ? (
          <ActivityIndicator color={colors.primaryForeground} size="small" />
        ) : (
          <Text style={s.authSubmitText}>{mode === "login" ? "Sign in" : "Create account"}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    scroll: { paddingHorizontal: 20 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    heading: { fontSize: 28, fontFamily: "Inter_700Bold", color: c.text, marginBottom: 6 },
    sub: { fontSize: 14, color: c.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 28, lineHeight: 20 },
    profileCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 16,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.primaryDark,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontSize: 22, fontFamily: "Inter_700Bold", color: c.primary },
    username: { fontSize: 18, fontFamily: "Inter_700Bold", color: c.text },
    userMeta: { fontSize: 13, color: c.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    statsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
    statCard: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
    },
    statValue: { fontSize: 28, fontFamily: "Inter_700Bold", color: c.primary },
    statLabel: { fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 2 },
    sectionLabel: { fontSize: 11, color: c.mutedForeground, fontFamily: "Inter_600SemiBold", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
    infoCard: {
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 24,
    },
    infoRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
    infoText: { flex: 1, fontSize: 13, color: c.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 19 },
    logoutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: "#450a0a",
      borderRadius: 12,
      padding: 14,
    },
    logoutText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.destructive },
    authCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
    },
    modeSwitcher: {
      flexDirection: "row",
      backgroundColor: c.secondary,
      borderRadius: 10,
      padding: 3,
      marginBottom: 4,
    },
    modeBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: "center",
      borderRadius: 8,
    },
    modeBtnActive: { backgroundColor: c.card },
    modeBtnText: { fontSize: 14, color: c.mutedForeground, fontFamily: "Inter_500Medium" },
    modeBtnTextActive: { color: c.text, fontFamily: "Inter_600SemiBold" },
    authInput: {
      backgroundColor: c.secondary,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: c.text,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      borderWidth: 1,
      borderColor: c.border,
    },
    authError: { fontSize: 13, color: c.destructive, fontFamily: "Inter_400Regular" },
    authSubmit: {
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 4,
    },
    authSubmitDisabled: { opacity: 0.5 },
    authSubmitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: c.primaryForeground },
  });
}
