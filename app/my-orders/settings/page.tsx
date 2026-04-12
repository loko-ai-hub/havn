"use client";

import { Inbox, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

function initials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return nameOrEmail.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password)
  );
}

export default function MyOrdersSettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) {
        router.replace("/my-orders/login");
        return;
      }
      setEmail(user.email);
      setFullName(
        (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) || ""
      );
      setPhone((typeof user.user_metadata?.phone === "string" && user.user_metadata.phone) || "");
    };
    void load();
  }, [router, supabase]);

  const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
      },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile updated");
  };

  const handlePasswordUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isStrongPassword(newPassword)) {
      toast.error("Password must have 8+ chars, upper/lowercase, and a number");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error(error.message);
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password updated");
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col bg-havn-navy md:flex">
        <div className="border-b border-white/10 p-6">
          <p className="text-lg font-semibold tracking-tight text-havn-sand">Havn</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          <Link href="/my-orders" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white">
            <Inbox className="h-4 w-4" />
            My Orders
          </Link>
          <Link href="/my-orders/settings" className="flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2.5 text-sm font-medium text-white">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <button
            type="button"
            onClick={() => toast.info("Help coming soon")}
            className="mt-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white"
          >
            Help
          </button>
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
              {initials(fullName || email)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{fullName || email}</p>
              <p className="truncate text-xs text-white/70">{email}</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 space-y-6 px-6 py-8 sm:px-10 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Profile</h2>
          <form className="mt-4 space-y-4" onSubmit={handleProfileSave}>
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </section>

        <details className="rounded-xl border border-border bg-card p-5">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Change Password
          </summary>
          <form className="mt-4 space-y-4" onSubmit={handlePasswordUpdate}>
            <div className="space-y-1.5">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            <p className="text-xs text-muted-foreground">Password must be 8+ chars and include uppercase, lowercase, and number.</p>
            <Button type="submit">Update Password</Button>
          </form>
        </details>

        <details className="rounded-xl border border-border bg-card p-5">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Notification Preferences
          </summary>
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={emailNotifications} onCheckedChange={setEmailNotifications} />
              Email notifications
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={smsNotifications} onCheckedChange={setSmsNotifications} />
              SMS notifications
            </label>
            <Button
              type="button"
              onClick={() => toast.success("Preferences saved")}
            >
              Save Preferences
            </Button>
          </div>
        </details>

        <section className="rounded-xl border border-destructive/40 bg-destructive/10 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-destructive">Delete Account</h2>
          <p className="mt-2 text-sm text-muted-foreground">This action is permanent and cannot be undone.</p>
          <Button type="button" variant="destructive" className="mt-4" onClick={() => setShowDeleteConfirm(true)}>
            Delete my account
          </Button>
          {showDeleteConfirm ? (
            <div className="mt-4 rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-foreground">Please contact support to delete your account.</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    toast.info("Please contact support to delete your account");
                  }}
                >
                  Confirm
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
