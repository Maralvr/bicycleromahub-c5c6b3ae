import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Loader2,
  User,
  Phone as PhoneIcon,
  Trash2,
  Tag,
  Languages as LangIcon,
  Award,
  MapPin,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChipsEditor } from "@/components/chips-editor";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useRentalPoints } from "@/lib/rental-points";
import { useStaffRentalPoints } from "@/lib/staff-rental-points";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My profile · Bicycle Roma" },
      { name: "description", content: "Edit your details, skills, languages, certifications and rental points." },
    ],
  }),
  component: ProfilePage,
});

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

const SUGGESTED_TAGS = ["e-bike", "vintage", "food-tour", "rental", "maintenance", "night-tour", "kids-friendly", "long-distance", "trailers", "VIP"];
const SUGGESTED_LANGS = ["English", "Italian", "Spanish", "French", "German", "Portuguese", "Mandarin"];
const SUGGESTED_LICENSES = ["Tour guide A", "Tour guide B", "Driver B", "First aid", "Mechanic L1", "Mechanic L2"];

function initialsFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "U";
  const parts = trimmed.split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? "";
  return (a + b).toUpperCase();
}

function ProfilePage() {
  const { user, profile, refresh, loading } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Staff record
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [licenses, setLicenses] = useState<string[]>([]);

  // Rental points
  const { points } = useRentalPoints();
  const { assignments, assign, unassign } = useStaffRentalPoints(user?.id ?? null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setPhone(profile.phone ?? "");
      setAvatarUrl(profile.avatar_url ?? null);
    }
  }, [profile?.id, profile?.display_name, profile?.phone, profile?.avatar_url]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, role, phone, tags, languages, licenses")
        .eq("profile_id", user.id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setStaffId(data.id);
      setStaffRole(data.role);
      setTags(data.tags ?? []);
      setLanguages(data.languages ?? []);
      setLicenses(data.licenses ?? []);
      if (!phone && data.phone) setPhone(data.phone);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (loading || !user) {
    return (
      <AppShell>
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  const handlePickFile = () => fileRef.current?.click();

  const handleUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please pick an image file");
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${user.id}/avatar-${Date.now()}.${ext || "jpg"}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, TEN_YEARS);
      if (signErr || !signed?.signedUrl) throw signErr ?? new Error("Could not sign URL");
      const url = signed.signedUrl;
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", user.id);
      if (updErr) throw updErr;
      setAvatarUrl(url);
      await refresh();
      toast.success("Photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemovePhoto = async () => {
    if (!user) return;
    setUploading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);
      if (error) throw error;
      setAvatarUrl(null);
      await refresh();
      toast.success("Photo removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setUploading(false);
    }
  };

  const togglePoint = async (pointId: string) => {
    const assigned = assignments.some((a) => a.rental_point_id === pointId);
    try {
      if (assigned) await unassign(pointId);
      else await assign(pointId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update rental point");
    }
  };

  const handleSave = async () => {
    if (!user) return;
    const name = displayName.trim();
    if (!name) {
      toast.error("Display name is required");
      return;
    }
    setSaving(true);
    try {
      const { error: pErr } = await supabase
        .from("profiles")
        .update({
          display_name: name,
          avatar_initials: initialsFromName(name),
          phone: phone.trim() || null,
        })
        .eq("id", user.id);
      if (pErr) throw pErr;

      if (staffId) {
        const { error: sErr } = await supabase
          .from("staff")
          .update({
            name,
            phone: phone.trim() || null,
            tags,
            languages,
            licenses,
          })
          .eq("id", staffId);
        if (sErr) throw sErr;
      }

      await refresh();
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const initials = initialsFromName(displayName || profile?.display_name || user.email || "U");
  const assignedIds = new Set(assignments.map((a) => a.rental_point_id));
  const activePoints = points.filter((p) => p.active);

  return (
    <AppShell>
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Update your details, skills and rental points. These are visible to your team and used by dispatch.
          </p>
        </div>

        <Card className="p-6 space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-5">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="h-24 w-24 rounded-full object-cover ring-2 ring-border"
                />
              ) : (
                <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center text-2xl font-bold ring-2 ring-border">
                  {initials}
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 rounded-full bg-background/70 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handlePickFile} disabled={uploading}>
                <Camera className="h-4 w-4 mr-1.5" />
                {avatarUrl ? "Change photo" : "Upload photo"}
              </Button>
              {avatarUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={handleRemovePhoto} disabled={uploading} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Remove
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                }}
              />
              <p className="text-[11px] text-muted-foreground">JPG, PNG or GIF. Max 5 MB.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-display-name" className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" /> Display name
            </Label>
            <Input
              id="profile-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={60}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-phone" className="flex items-center gap-1.5">
              <PhoneIcon className="h-3.5 w-3.5 text-muted-foreground" /> Phone
            </Label>
            <Input
              id="profile-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+39 …"
              maxLength={30}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-muted-foreground">Email</Label>
            <Input value={user.email ?? ""} disabled />
            <p className="text-[11px] text-muted-foreground">Email is managed by your sign-in provider.</p>
          </div>
        </Card>

        {staffId && (
          <Card className="p-6 space-y-6">
            <div>
              <h2 className="text-base font-semibold">Skills & experience</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Keep these accurate so dispatch can match you to the right tours.
              </p>
            </div>

            <ChipsEditor
              label="Skills & tags"
              icon={Tag}
              values={tags}
              onChange={setTags}
              suggestions={SUGGESTED_TAGS}
              placeholder="Add a tag (e.g. food-tour)"
            />

            <ChipsEditor
              label="Languages"
              icon={LangIcon}
              values={languages}
              onChange={setLanguages}
              suggestions={SUGGESTED_LANGS}
              placeholder="Add a language"
            />

            <ChipsEditor
              label="Licenses & certifications"
              icon={Award}
              values={licenses}
              onChange={setLicenses}
              suggestions={SUGGESTED_LICENSES}
              placeholder="Add a license"
            />
          </Card>
        )}

        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-muted-foreground" /> Rental points
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pick every rental point you work at. You can choose more than one. Changes save instantly.
            </p>
          </div>

          {activePoints.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No rental points available yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {activePoints.map((p) => {
                const active = assignedIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePoint(p.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}

          {assignments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/60">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground self-center mr-1">
                You work at:
              </span>
              {assignments.map((a) => {
                const point = points.find((p) => p.id === a.rental_point_id);
                if (!point) return null;
                return (
                  <Badge key={a.id} variant="secondary" className="text-xs">
                    {point.name}
                    {a.is_primary && <span className="ml-1 text-[9px] uppercase">primary</span>}
                  </Badge>
                );
              })}
            </div>
          )}
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="lg">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>

        {staffRole === "admin" && (
          <p className="text-[11px] text-muted-foreground text-center">
            Admin: role and account status can only be changed from the Staff page.
          </p>
        )}
      </div>
    </AppShell>
  );
}
