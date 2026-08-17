import { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, TextInput, Platform } from "react-native";
import { AppText } from "@/src/components/AppText";
import { GradientButton } from "@/src/components/GradientButton";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/auth";
import { AuthHero, AuthBackground } from "@/src/components/AuthHero";
import { FAMILY_PHOTO } from "@/src/constants/personas";
import { theme } from "@/src/theme";

export default function ChildLogin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signInChild, signUpChild } = useAuth();

  // An invite link carries the family code, so nobody has to read six
  // characters down a phone line.
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [mode, setMode] = useState<"login" | "signup">(code ? "signup" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [familyCode, setFamilyCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (code) {
      setFamilyCode(code.toUpperCase());
      setMode("signup");
    }
  }, [code]);

  const submit = async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setBusy(true);
    setError("");
    try {
      if (mode === "login") await signInChild(email.trim(), password);
      else await signUpChild(name.trim(), email.trim(), password, familyCode.trim().toUpperCase());
    } catch (e: any) {
      setError(e.message || "Please try again");
      setBusy(false);
    }
  };

  const canSubmit =
    mode === "login"
      ? email.trim() && password.length >= 1
      : name.trim() && email.trim() && password.length >= 6 && familyCode.trim().length >= 4;

  return (
    <View style={styles.root} testID="child-login">
      <AuthBackground />
      <AuthHero
        icon="people"
        photo={FAMILY_PHOTO}
        title={mode === "login" ? "Welcome back" : "Create your account"}
        subtitle={mode === "login" ? "Log in to care for your parent" : "Your parent's family code connects you"}
        onBack={() => router.back()}
        insetTop={insets.top}
        compact
      />

      <View style={[styles.sheet, { marginBottom: insets.bottom + 16 }]}>
        <KeyboardAwareScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" bottomOffset={20}>
          {mode === "signup" && (
            <Field icon="person" value={name} onChangeText={setName} placeholder="Your name" testID="child-name" />
          )}
          <Field icon="mail" value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" testID="child-email" />
          <Field
            icon="lock-closed"
            value={password}
            onChangeText={setPassword}
            placeholder={mode === "signup" ? "Password — at least 6 characters" : "Password"}
            secureTextEntry={!showPassword}
            testID="child-password"
            rightIcon={showPassword ? "eye-off" : "eye"}
            onRightIconPress={() => setShowPassword((v) => !v)}
            rightIconLabel={showPassword ? "Hide password" : "Show password"}
          />
          {mode === "signup" && (
            <Field
              icon="key"
              value={familyCode}
              onChangeText={(t: string) => setFamilyCode(t.toUpperCase())}
              placeholder="Family code, from your parent's profile"
              autoCapitalize="characters"
              testID="child-family-code"
            />
          )}

          {error ? <AppText style={styles.error} testID="child-error" accessibilityLiveRegion="assertive" accessibilityRole="alert">{error}</AppText> : null}

          <GradientButton tone="brand"
            style={[styles.primaryBtn, (!canSubmit || busy) && styles.btnDisabled]}
            disabled={!canSubmit || busy}
            onPress={submit}
            testID="child-submit"
            accessibilityRole="button"
            accessibilityLabel={mode === "login" ? "Log in" : "Create account"}
          >
            <AppText style={styles.primaryBtnText}>{busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}</AppText>
          </GradientButton>

          <Pressable onPress={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }} style={styles.switchLink} testID="child-switch-mode">
            <AppText style={styles.switchText}>
              {mode === "login" ? "Don't have an account? " : "Have an account? "}
              <AppText style={styles.switchBold}>{mode === "login" ? "Sign up" : "Log in"}</AppText>
            </AppText>
          </Pressable>
        </KeyboardAwareScrollView>
      </View>
    </View>
  );
}

function Field({
  icon, testID, rightIcon, onRightIconPress, rightIconLabel, ...props
}: any) {
  return (
    <View style={styles.field}>
      <Ionicons name={icon} size={20} color={theme.colors.muted} style={styles.fieldIcon} />
      <TextInput style={styles.input} placeholderTextColor={theme.colors.muted} testID={testID} {...props} />
      {rightIcon && (
        <Pressable
          onPress={onRightIconPress}
          hitSlop={10}
          style={styles.fieldRightIcon}
          testID={`${testID}-toggle`}
          accessibilityRole="button"
          accessibilityLabel={rightIconLabel}
        >
          <Ionicons name={rightIcon} size={20} color={theme.colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  sheet: {
    flex: 1, marginHorizontal: 16, borderRadius: 32,
    backgroundColor: theme.colors.surface, overflow: "hidden",
  },
  form: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40, gap: 14 },
  field: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 18, borderWidth: 2, borderColor: theme.colors.border,
    paddingHorizontal: 18, minHeight: 58,
  },
  fieldIcon: { flexShrink: 0 },
  input: { flex: 1, fontSize: 18, color: theme.colors.onSurface, paddingVertical: 16 },
  fieldRightIcon: { padding: 6, flexShrink: 0 },
  error: { color: theme.colors.error, fontSize: 15, fontWeight: "600", textAlign: "center" },
  primaryBtn: { backgroundColor: theme.colors.brand, borderRadius: 999, paddingVertical: 18, alignItems: "center", marginTop: 8 },
  primaryBtnText: { color: "#fff", fontSize: 19, fontWeight: "800" },
  btnDisabled: { opacity: 0.4 },
  switchLink: { alignItems: "center", marginTop: 6 },
  switchText: { fontSize: 16, color: theme.colors.muted },
  switchBold: { color: theme.colors.brand, fontWeight: "800" },
});
