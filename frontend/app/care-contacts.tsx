import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from "react-native";
import { AppText } from "@/src/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { apiFetch } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Card, IconWell, SectionHeader } from "@/src/components/ui";
import { theme } from "@/src/theme";

/**
 * The numbers the app can dial: who to ring in an emergency, and which clinics
 * to call about an appointment.
 *
 * Reached from both sides. A family member is usually the one typing — they
 * have the numbers — but the elder can open it too, because seeing who would
 * come if she pressed the button is worth more to her than the ability to edit
 * it.
 */

type Contact = { id: string; name: string; phone: string; relation: string; user_id?: string };
type Doctor = { id: string; name: string; phone: string; specialty?: string; place?: string };

type Editing =
  | { kind: "contact"; id?: string; name: string; phone: string; relation: string }
  | { kind: "doctor"; id?: string; name: string; phone: string; specialty: string; place: string }
  | null;

export default function CareContacts() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isElder = user?.role === "elder";

  const [chain, setChain] = useState<Contact[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, d] = await Promise.all([
        apiFetch<{ chain: Contact[] }>("/contacts").catch(() => ({ chain: [] })),
        apiFetch<Doctor[]>("/doctors").catch(() => []),
      ]);
      setChain(c.chain || []);
      setDoctors(d || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tap = () => { if (Platform.OS !== "web") Haptics.selectionAsync(); };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      if (editing.kind === "contact") {
        const body = { name: editing.name, phone: editing.phone, relation: editing.relation };
        if (editing.id) await apiFetch(`/contacts/${editing.id}`, { method: "PUT", body });
        else await apiFetch("/contacts", { method: "POST", body });
      } else {
        const body = { name: editing.name, phone: editing.phone, specialty: editing.specialty, place: editing.place };
        if (editing.id) await apiFetch(`/doctors/${editing.id}`, { method: "PUT", body });
        else await apiFetch("/doctors", { method: "POST", body });
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e?.message || "We could not save that.");
    }
    setBusy(false);
  };

  const remove = async (kind: "contact" | "doctor", id: string) => {
    tap();
    try {
      await apiFetch(kind === "contact" ? `/contacts/${id}` : `/doctors/${id}`, { method: "DELETE" });
      await load();
    } catch {}
  };

  /** Move a contact up the chain. Order is the whole point of this list. */
  const moveUp = async (i: number) => {
    if (i <= 0) return;
    tap();
    const next = [...chain];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setChain(next);
    try {
      // Family folded in automatically carry a `user:` id the server does not
      // store as a contact row, so they are left out of the explicit order.
      const ids = next.filter((c) => !c.id.startsWith("user:")).map((c) => c.id);
      await apiFetch("/contacts/order", { method: "POST", body: { ids } });
    } catch {}
    load();
  };

  const canSave = Boolean(editing?.name.trim() && editing?.phone.trim());

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]} testID="care-contacts">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.hBtn}
          testID="care-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={28} color={theme.colors.onSurface} />
        </Pressable>
        <AppText style={styles.hTitle}>Who we can call</AppText>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          <SectionHeader
            title="In an emergency"
            hint={isElder
              ? "If you press SOS, we call these people in this order until someone answers."
              : "We call these in order until someone answers. Anyone without a number is skipped."}
          />

          {chain.length === 0 && (
            <AppText style={styles.empty} testID="chain-empty">
              Nobody can be called yet. Add a number below, and make sure family members have added their own in their profile.
            </AppText>
          )}

          {chain.map((c, i) => (
            <View key={c.id} style={styles.row} testID={`contact-${c.id}`}>
              <View style={styles.rank}><AppText style={styles.rankText}>{i + 1}</AppText></View>
              <View style={{ flex: 1 }}>
                <AppText style={styles.rowName}>{c.name}</AppText>
                <AppText style={styles.rowMeta}>{c.relation} • {c.phone}</AppText>
              </View>
              {i > 0 && (
                <Pressable onPress={() => moveUp(i)} hitSlop={8} style={styles.iconBtn}
                  testID={`up-${c.id}`} accessibilityRole="button" accessibilityLabel={`Call ${c.name} earlier`}>
                  <Ionicons name="arrow-up" size={22} color={theme.colors.brand} />
                </Pressable>
              )}
              {!c.id.startsWith("user:") && (
                <>
                  <Pressable
                    onPress={() => { tap(); setEditing({ kind: "contact", id: c.id, name: c.name, phone: c.phone, relation: c.relation }); }}
                    hitSlop={8} style={styles.iconBtn}
                    testID={`edit-${c.id}`} accessibilityRole="button" accessibilityLabel={`Edit ${c.name}`}>
                    <Ionicons name="pencil" size={20} color={theme.colors.muted} />
                  </Pressable>
                  <Pressable onPress={() => remove("contact", c.id)} hitSlop={8} style={styles.iconBtn}
                    testID={`del-${c.id}`} accessibilityRole="button" accessibilityLabel={`Remove ${c.name}`}>
                    <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                  </Pressable>
                </>
              )}
            </View>
          ))}

          <Pressable style={styles.addBtn}
            onPress={() => { tap(); setEditing({ kind: "contact", name: "", phone: "", relation: "Neighbour" }); }}
            testID="add-contact" accessibilityRole="button" accessibilityLabel="Add someone to call in an emergency">
            <Ionicons name="add-circle" size={24} color={theme.colors.brand} />
            <AppText style={styles.addText}>Add a neighbour or friend</AppText>
          </Pressable>

          <SectionHeader title="Doctors &amp; clinics" hint="Numbers we can ring to arrange an appointment." />

          {doctors.length === 0 && (
            <AppText style={styles.empty} testID="doctors-empty">
              No clinics saved yet. Add one so appointments can be arranged by phone.
            </AppText>
          )}

          {doctors.map((d) => (
            <View key={d.id} style={styles.row} testID={`doctor-${d.id}`}>
              <IconWell icon="medkit" size={38} />
              <View style={{ flex: 1 }}>
                <AppText style={styles.rowName}>{d.name}</AppText>
                <AppText style={styles.rowMeta}>
                  {[d.specialty, d.phone].filter(Boolean).join(" • ")}
                  {d.place ? `\n${d.place}` : ""}
                </AppText>
              </View>
              <Pressable
                onPress={() => { tap(); setEditing({ kind: "doctor", id: d.id, name: d.name, phone: d.phone, specialty: d.specialty || "", place: d.place || "" }); }}
                hitSlop={8} style={styles.iconBtn}
                testID={`edit-doc-${d.id}`} accessibilityRole="button" accessibilityLabel={`Edit ${d.name}`}>
                <Ionicons name="pencil" size={20} color={theme.colors.muted} />
              </Pressable>
              <Pressable onPress={() => remove("doctor", d.id)} hitSlop={8} style={styles.iconBtn}
                testID={`del-doc-${d.id}`} accessibilityRole="button" accessibilityLabel={`Remove ${d.name}`}>
                <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
              </Pressable>
            </View>
          ))}

          <Pressable style={styles.addBtn}
            onPress={() => { tap(); setEditing({ kind: "doctor", name: "", phone: "", specialty: "", place: "" }); }}
            testID="add-doctor" accessibilityRole="button" accessibilityLabel="Add a doctor or clinic">
            <Ionicons name="add-circle" size={24} color={theme.colors.brand} />
            <AppText style={styles.addText}>Add a doctor or clinic</AppText>
          </Pressable>
        </ScrollView>
      )}

      {editing && (
        <View style={styles.backdrop} testID="edit-sheet">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !busy && setEditing(null)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.handle} />
            <AppText style={styles.sheetTitle}>
              {editing.id ? "Edit" : "Add"} {editing.kind === "contact" ? "contact" : "clinic"}
            </AppText>

            <Field value={editing.name} placeholder={editing.kind === "contact" ? "Their name" : "Clinic or doctor name"}
              onChangeText={(t: string) => setEditing({ ...editing, name: t })} testID="f-name" />
            <Field value={editing.phone} placeholder="Phone number" keyboardType="phone-pad"
              onChangeText={(t: string) => setEditing({ ...editing, phone: t })} testID="f-phone" />
            {editing.kind === "contact" ? (
              <Field value={editing.relation} placeholder="How you know them, e.g. Neighbour"
                onChangeText={(t: string) => setEditing({ ...editing, relation: t })} testID="f-relation" />
            ) : (
              <>
                <Field value={editing.specialty} placeholder="Speciality, e.g. Cardiology"
                  onChangeText={(t: string) => setEditing({ ...editing, specialty: t })} testID="f-specialty" />
                <Field value={editing.place} placeholder="Where they are"
                  onChangeText={(t: string) => setEditing({ ...editing, place: t })} testID="f-place" />
              </>
            )}

            {error ? <AppText style={styles.err} accessibilityRole="alert">{error}</AppText> : null}

            <Button label="Save" onPress={save} busy={busy} disabled={!canSave} testID="save-entry" />
            <Button label="Cancel" variant="quiet" onPress={() => setEditing(null)} disabled={busy} testID="cancel-entry" />
          </View>
        </View>
      )}
    </View>
  );
}

function Field(props: any) {
  return (
    <TextInput
      {...props}
      style={styles.input}
      placeholderTextColor={theme.colors.muted}
      accessibilityLabel={props.placeholder}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  hBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  hTitle: { flex: 1, textAlign: "center", fontSize: theme.font.lg, fontWeight: "800", color: theme.colors.onSurface },
  section: { fontSize: theme.font.md, fontWeight: "800", color: theme.colors.onSurface },
  sectionSub: { fontSize: theme.font.sm, color: theme.colors.muted, marginTop: 2, marginBottom: 12, lineHeight: 21 },
  empty: { fontSize: theme.font.sm, color: theme.colors.muted, lineHeight: 22, marginBottom: 12 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 14, marginBottom: 10,
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  rank: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.brandLight,
    alignItems: "center", justifyContent: "center",
  },
  rankText: { fontSize: theme.font.sm, fontWeight: "800", color: theme.colors.brand },
  docIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.brandLight,
    alignItems: "center", justifyContent: "center",
  },
  rowName: { fontSize: theme.font.base, fontWeight: "800", color: theme.colors.onSurface },
  rowMeta: { fontSize: theme.font.sm, color: theme.colors.muted, marginTop: 1, lineHeight: 19 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: theme.radius.lg, borderWidth: 2, borderStyle: "dashed",
    borderColor: theme.colors.borderStrong, minHeight: 58,
  },
  addText: { fontSize: theme.font.base, fontWeight: "700", color: theme.colors.brand },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl,
    padding: 22, gap: 10,
  },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: theme.colors.borderStrong, alignSelf: "center" },
  sheetTitle: { fontSize: theme.font.lg, fontWeight: "800", color: theme.colors.onSurface, textAlign: "center", marginBottom: 4 },
  input: {
    fontSize: theme.font.base, color: theme.colors.onSurface, backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md, borderWidth: 2, borderColor: theme.colors.border,
    paddingHorizontal: 16, paddingVertical: 14, minHeight: 54,
  },
  err: { fontSize: theme.font.sm, color: theme.colors.error, fontWeight: "700" },
});
