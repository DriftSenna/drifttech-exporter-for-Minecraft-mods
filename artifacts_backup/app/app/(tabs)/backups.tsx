import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/context/AuthContext";

interface Backup {
  id: number;
  filename: string;
  modName: string;
  version: string;
  source: string;
  mcVersion: string | null;
  loader: string | null;
  type: string;
  createdAt: string;
}

export default function BackupsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { get, post, del } = useApi();
  const { user } = useAuth();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data, isLoading, refetch } = useQuery<{ backups: Backup[] }>({
    queryKey: ["backups"],
    queryFn: () => get<{ backups: Backup[] }>("/api/backups"),
    enabled: !!user,
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => post(`/api/backups/${id}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["downloads-list"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => del(`/api/backups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backups"] }),
  });

  const backups = data?.backups ?? [];

  const s = makeStyles(colors);

  if (!user) {
    return (
      <View style={[s.root, { paddingTop: topPad + 16 }]}>
        <View style={s.center}>
          <Feather name="lock" size={40} color={colors.mutedForeground} />
          <Text style={s.emptyText}>Sign in required</Text>
          <Text style={s.emptySub}>Go to Account to create an account and start backing up your mods</Text>
        </View>
      </View>
    );
  }

  const renderItem = ({ item }: { item: Backup }) => {
    const date = new Date(item.createdAt).toLocaleDateString();
    const meta = [item.mcVersion, item.loader].filter(Boolean).join(" · ");
    return (
      <View style={s.item}>
        <View style={s.itemLeft}>
          <Text style={s.itemName} numberOfLines={2}>{item.modName}</Text>
          <Text style={s.itemVersion}>v{item.version}</Text>
          <View style={s.metaRow}>
            {meta ? <Text style={s.metaText}>{meta}</Text> : null}
            <Text style={s.metaText}>{item.type}</Text>
            <Text style={s.metaText}>{date}</Text>
          </View>
        </View>
        <View style={s.actions}>
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Alert.alert(
                "Restore Backup",
                `Restore "${item.modName}" v${item.version} to your downloads folder?`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Restore",
                    onPress: () => restoreMutation.mutate(item.id),
                  },
                ]
              );
            }}
          >
            <Feather name="refresh-cw" size={15} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, s.deleteBtn]}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              Alert.alert("Delete Backup", "This will permanently delete the backup.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => deleteMutation.mutate(item.id),
                },
              ]);
            }}
          >
            <Feather name="trash-2" size={15} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[s.root, { paddingTop: topPad + 16 }]}>
      <View style={s.header}>
        <Text style={s.heading}>Backups</Text>
        <Text style={s.sub}>{backups.length} backup{backups.length !== 1 ? "s" : ""} · {user.username}</Text>
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : backups.length === 0 ? (
        <View style={s.center}>
          <Feather name="archive" size={40} color={colors.mutedForeground} />
          <Text style={s.emptyText}>No backups yet</Text>
          <Text style={s.emptySub}>In the Library, tap a mod to back it up</Text>
        </View>
      ) : (
        <FlatList
          data={backups}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={[s.list, { paddingBottom: botPad + 100 }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={backups.length > 0}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    header: { paddingHorizontal: 20, marginBottom: 12 },
    heading: { fontSize: 28, fontFamily: "Inter_700Bold", color: c.text },
    sub: { fontSize: 14, color: c.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingHorizontal: 32,
    },
    emptyText: { fontSize: 18, color: c.text, fontFamily: "Inter_600SemiBold", textAlign: "center" },
    emptySub: {
      fontSize: 14,
      color: c.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
    },
    list: { paddingHorizontal: 16, paddingTop: 4 },
    item: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      marginVertical: 4,
    },
    itemLeft: { flex: 1 },
    itemName: { fontSize: 14, color: c.text, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
    itemVersion: { fontSize: 12, color: c.primary, fontFamily: "Inter_500Medium", marginBottom: 6 },
    metaRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    metaText: { fontSize: 11, color: c.mutedForeground, fontFamily: "Inter_400Regular" },
    actions: { flexDirection: "row", gap: 8 },
    actionBtn: {
      width: 34,
      height: 34,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#052e1622",
    },
    deleteBtn: { backgroundColor: "#450a0a22" },
  });
}
