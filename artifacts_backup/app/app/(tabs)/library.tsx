import React, { useState } from "react";
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

interface FileEntry {
  name: string;
  size: number;
}

interface ScanResult {
  file: string;
  safe: boolean;
  issues: string[];
  warnings: string[];
}

interface ScanData {
  allSafe: boolean;
  results: ScanResult[];
}

export default function LibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { get, del } = useApi();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: files, isLoading: filesLoading, refetch: refetchFiles } = useQuery<{ files?: FileEntry[] } | FileEntry[]>({
    queryKey: ["downloads-list"],
    queryFn: () => get<{ files?: FileEntry[] } | FileEntry[]>("/api/downloads"),
  });

  const { data: scanData, isLoading: scanLoading, refetch: refetchScan } = useQuery<ScanData>({
    queryKey: ["downloads-scan"],
    queryFn: () => get<ScanData>("/api/downloads/scan"),
  });

  const fileList: FileEntry[] = Array.isArray(files) ? files : (files as any)?.files ?? [];
  const scanMap = new Map<string, ScanResult>(
    (scanData?.results ?? []).map((r) => [r.file, r])
  );

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => del(`/api/downloads/${encodeURIComponent(filename)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["downloads-list"] });
      qc.invalidateQueries({ queryKey: ["downloads-scan"] });
    },
  });

  const handleDelete = (name: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Remove", `Remove "${name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => deleteMutation.mutate(name),
      },
    ]);
  };

  const handleRefresh = () => {
    refetchFiles();
    refetchScan();
  };

  const s = makeStyles(colors);

  const renderItem = ({ item }: { item: FileEntry }) => {
    const scan = scanMap.get(item.name);
    const isScanning = scanLoading;
    const isSafe = scan?.safe;
    const hasIssues = scan && !scan.safe;
    const hasWarnings = scan && scan.warnings.length > 0;

    return (
      <View style={s.item}>
        <View style={s.itemLeft}>
          <Text style={s.itemName} numberOfLines={2}>{item.name}</Text>
          <View style={s.itemMeta}>
            <Text style={s.itemSize}>{(item.size / 1024 / 1024).toFixed(1)} MB</Text>
            {isScanning ? (
              <View style={s.badge}>
                <ActivityIndicator size="small" color={colors.mutedForeground} style={{ transform: [{ scale: 0.6 }] }} />
                <Text style={s.badgeText}>Scanning</Text>
              </View>
            ) : hasIssues ? (
              <View style={[s.badge, s.badgeUnsafe]}>
                <Feather name="alert-triangle" size={10} color={colors.destructive} />
                <Text style={[s.badgeText, { color: colors.destructive }]}>UNSAFE</Text>
              </View>
            ) : hasWarnings ? (
              <View style={[s.badge, s.badgeWarn]}>
                <Feather name="alert-circle" size={10} color={colors.warning} />
                <Text style={[s.badgeText, { color: colors.warning }]}>
                  {scan.warnings.length} warning{scan.warnings.length > 1 ? "s" : ""}
                </Text>
              </View>
            ) : scan ? (
              <View style={[s.badge, s.badgeSafe]}>
                <Feather name="check-circle" size={10} color={colors.safe} />
                <Text style={[s.badgeText, { color: colors.safe }]}>Safe</Text>
              </View>
            ) : null}
          </View>
        </View>
        <TouchableOpacity
          style={s.deleteBtn}
          onPress={() => handleDelete(item.name)}
          disabled={deleteMutation.isPending}
        >
          <Feather name="trash-2" size={16} color={colors.destructive} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[s.root, { paddingTop: topPad + 16 }]}>
      <View style={s.header}>
        <Text style={s.heading}>Library</Text>
        <Text style={s.sub}>{fileList.length} file{fileList.length !== 1 ? "s" : ""}</Text>
      </View>

      {filesLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : fileList.length === 0 ? (
        <View style={s.center}>
          <Feather name="package" size={40} color={colors.mutedForeground} />
          <Text style={s.emptyText}>No files yet</Text>
          <Text style={s.emptySub}>Go to Download to add mods</Text>
        </View>
      ) : (
        <FlatList
          data={fileList}
          keyExtractor={(item) => item.name}
          renderItem={renderItem}
          contentContainerStyle={[s.list, { paddingBottom: botPad + 100 }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={fileList.length > 0}
          refreshControl={
            <RefreshControl
              refreshing={filesLoading}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={s.separator} />}
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
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
    emptyText: { fontSize: 18, color: c.text, fontFamily: "Inter_600SemiBold" },
    emptySub: { fontSize: 14, color: c.mutedForeground, fontFamily: "Inter_400Regular" },
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
    itemName: { fontSize: 14, color: c.text, fontFamily: "Inter_500Medium", marginBottom: 6, lineHeight: 20 },
    itemMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
    itemSize: { fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular" },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: c.secondary,
    },
    badgeSafe: { backgroundColor: "#052e16" },
    badgeWarn: { backgroundColor: "#451a03" },
    badgeUnsafe: { backgroundColor: "#450a0a" },
    badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: c.mutedForeground },
    deleteBtn: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#450a0a22",
    },
    separator: { height: 0 },
  });
}
