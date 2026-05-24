import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useApi } from "@/hooks/useApi";

const MC_VERSIONS = ["1.21.4", "1.21.1", "1.20.4", "1.20.1", "1.19.4", "1.18.2", "1.16.5"];
const LOADERS = ["Forge", "Fabric", "NeoForge", "Quilt"];
const TYPES = ["mod", "resourcepack", "shader"] as const;
const TYPE_LABELS: Record<string, string> = { mod: "Mod", resourcepack: "Resource Pack", shader: "Shader" };

type DownloadType = (typeof TYPES)[number];

interface DownloadJob {
  status: "running" | "done" | "error";
  lines: string[];
  done: boolean;
}

export default function DownloadScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { post, get, baseUrl } = useApi();

  const [mcVersion, setMcVersion] = useState("1.20.1");
  const [loader, setLoader] = useState("Forge");
  const [type, setType] = useState<DownloadType>("mod");
  const [url, setUrl] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentLogs, setRecentLogs] = useState<string[]>([]);

  const { data: jobStatus, isLoading: jobLoading } = useQuery<DownloadJob>({
    queryKey: ["download-job", jobId],
    queryFn: () => get<DownloadJob>(`/api/download/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.done ? false : 1000;
    },
  });

  const isDownloading = !!jobId && !jobStatus?.done;

  const handleDownload = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!trimmed.includes("modrinth.com") && !trimmed.includes("curseforge.com")) {
      setError("Only Modrinth and CurseForge links are supported");
      return;
    }
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await post<{ jobId: string }>("/api/download", {
        url: trimmed,
        mcVersion,
        loader: loader.toLowerCase(),
        type,
      });
      setJobId(result.jobId);
      setUrl("");
    } catch (e: any) {
      setError(e.message ?? "Download failed");
    }
  }, [url, mcVersion, loader, type, post]);

  const handleJobDone = useCallback(() => {
    if (jobStatus?.done && jobId) {
      setRecentLogs((prev) => {
        const lines = jobStatus.lines.filter(Boolean).slice(-10);
        return [...lines, ...prev].slice(0, 30);
      });
      setJobId(null);
    }
  }, [jobStatus, jobId]);

  React.useEffect(() => {
    if (jobStatus?.done) handleJobDone();
  }, [jobStatus?.done]);

  const s = makeStyles(colors);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[s.root, { paddingTop: topPad + 16 }]}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: botPad + 100 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={s.heading}>DriftTech Exporter</Text>
        <Text style={s.sub}>Download mods, resource packs & shaders</Text>

        {/* Type selector */}
        <View style={s.chipRow}>
          {TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.chip, type === t && s.chipActive]}
              onPress={() => {
                setType(t);
                Haptics.selectionAsync();
              }}
            >
              <Text style={[s.chipText, type === t && s.chipTextActive]}>
                {TYPE_LABELS[t]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Version + Loader row */}
        <View style={s.pickerRow}>
          <SelectorCard
            label="MC Version"
            value={mcVersion}
            options={MC_VERSIONS}
            onSelect={(v) => { setMcVersion(v); Haptics.selectionAsync(); }}
            colors={colors}
          />
          {type === "mod" && (
            <SelectorCard
              label="Loader"
              value={loader}
              options={LOADERS}
              onSelect={(v) => { setLoader(v); Haptics.selectionAsync(); }}
              colors={colors}
            />
          )}
        </View>

        {/* URL Input */}
        <View style={s.inputCard}>
          <Text style={s.inputLabel}>Paste link</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={url}
              onChangeText={setUrl}
              placeholder="https://modrinth.com/mod/..."
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isDownloading}
              returnKeyType="go"
              onSubmitEditing={handleDownload}
            />
            <TouchableOpacity
              style={[s.dlBtn, isDownloading && s.dlBtnDisabled]}
              onPress={handleDownload}
              disabled={isDownloading || !url.trim()}
            >
              {isDownloading ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <Feather name="download" size={18} color={colors.primaryForeground} />
              )}
            </TouchableOpacity>
          </View>
          {error ? <Text style={s.errorText}>{error}</Text> : null}
        </View>

        {/* Active job */}
        {isDownloading && (
          <View style={s.jobCard}>
            <View style={s.jobHeader}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={s.jobTitle}>Downloading…</Text>
            </View>
            {jobStatus?.lines.slice(-5).map((line, i) => (
              <Text key={i} style={s.jobLine}>{line}</Text>
            ))}
          </View>
        )}

        {jobStatus?.done && (
          <View style={[s.jobCard, { borderColor: jobStatus.status === "error" ? colors.destructive : colors.primary }]}>
            <View style={s.jobHeader}>
              <Feather
                name={jobStatus.status === "error" ? "x-circle" : "check-circle"}
                size={16}
                color={jobStatus.status === "error" ? colors.destructive : colors.primary}
              />
              <Text style={[s.jobTitle, { color: jobStatus.status === "error" ? colors.destructive : colors.primary }]}>
                {jobStatus.status === "error" ? "Download failed" : "Download complete"}
              </Text>
            </View>
            {jobStatus.lines.slice(-5).map((line, i) => (
              <Text key={i} style={s.jobLine}>{line}</Text>
            ))}
          </View>
        )}

        {/* Recent logs */}
        {recentLogs.length > 0 && (
          <View style={s.logsSection}>
            <Text style={s.logsTitle}>Recent</Text>
            {recentLogs.map((line, i) => (
              <Text key={i} style={s.logLine} numberOfLines={1}>{line}</Text>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function SelectorCard({
  label,
  value,
  options,
  onSelect,
  colors,
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [open, setOpen] = useState(false);
  const s = makeStyles(colors);
  return (
    <View style={s.selectorWrap}>
      <Text style={s.selectorLabel}>{label}</Text>
      <TouchableOpacity style={s.selectorBtn} onPress={() => setOpen((o) => !o)}>
        <Text style={s.selectorValue}>{value}</Text>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
      </TouchableOpacity>
      {open && (
        <View style={s.dropdown}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[s.dropItem, opt === value && s.dropItemActive]}
              onPress={() => { onSelect(opt); setOpen(false); }}
            >
              <Text style={[s.dropItemText, opt === value && s.dropItemTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    scroll: { paddingHorizontal: 20 },
    heading: { fontSize: 28, fontFamily: "Inter_700Bold", color: c.text, marginBottom: 4 },
    sub: { fontSize: 14, color: c.mutedForeground, marginBottom: 24, fontFamily: "Inter_400Regular" },
    chipRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    chipActive: { backgroundColor: c.primaryDark, borderColor: c.primary },
    chipText: { fontSize: 13, color: c.mutedForeground, fontFamily: "Inter_500Medium" },
    chipTextActive: { color: c.primary },
    pickerRow: { flexDirection: "row", gap: 12, marginBottom: 20, zIndex: 100 },
    selectorWrap: { flex: 1, zIndex: 10 },
    selectorLabel: { fontSize: 11, color: c.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
    selectorBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    selectorValue: { fontSize: 14, color: c.text, fontFamily: "Inter_500Medium" },
    dropdown: {
      position: "absolute",
      top: "100%",
      left: 0,
      right: 0,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      overflow: "hidden",
      zIndex: 100,
      marginTop: 4,
    },
    dropItem: { paddingHorizontal: 14, paddingVertical: 10 },
    dropItemActive: { backgroundColor: c.primaryDark },
    dropItemText: { fontSize: 14, color: c.text, fontFamily: "Inter_400Regular" },
    dropItemTextActive: { color: c.primary, fontFamily: "Inter_600SemiBold" },
    inputCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 16,
    },
    inputLabel: { fontSize: 11, color: c.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
    inputRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    input: {
      flex: 1,
      backgroundColor: c.secondary,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: c.text,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      borderWidth: 1,
      borderColor: c.border,
    },
    dlBtn: {
      backgroundColor: c.primary,
      borderRadius: 10,
      width: 46,
      height: 46,
      alignItems: "center",
      justifyContent: "center",
    },
    dlBtnDisabled: { backgroundColor: c.primaryDark, opacity: 0.6 },
    errorText: { marginTop: 8, fontSize: 12, color: c.destructive, fontFamily: "Inter_400Regular" },
    jobCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 16,
    },
    jobHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
    jobTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: c.text },
    jobLine: { fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    logsSection: { marginTop: 8 },
    logsTitle: { fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_600SemiBold", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
    logLine: { fontSize: 12, color: c.textDim ?? c.mutedForeground, fontFamily: "Inter_400Regular", paddingVertical: 2 },
  });
}
