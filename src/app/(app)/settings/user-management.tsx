"use client";

import { useActionState, useTransition } from "react";
import { createUser, updateUserRole, deleteUser } from "@/actions/users";

type TeamUser = { id: string; name: string; email: string; role: "ADMIN" | "MEMBER" };

export default function UserManagement({
  users,
  currentUserId,
}: {
  users: TeamUser[];
  currentUserId: string;
}) {
  const [state, formAction, pending] = useActionState(createUser, undefined);
  const [, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <ul className="divide-y divide-white/10">
        {users.map((user) => (
          <li key={user.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium text-amo-white">{user.name}</p>
              <p className="text-xs text-amo-muted">{user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                defaultValue={user.role}
                disabled={user.id === currentUserId}
                onChange={(e) =>
                  startTransition(() =>
                    updateUserRole(user.id, e.target.value as "ADMIN" | "MEMBER")
                  )
                }
                className="rounded-md border border-amo-border bg-white/5 px-2 py-1 text-xs text-amo-white shadow-sm disabled:opacity-60"
              >
                <option value="ADMIN">Admin</option>
                <option value="MEMBER">Member</option>
              </select>
              <button
                type="button"
                disabled={user.id === currentUserId}
                onClick={() => {
                  if (!confirm(`Remove ${user.name}?`)) return;
                  startTransition(() => deleteUser(user.id));
                }}
                className="text-xs text-amo-muted hover:text-red-400 disabled:opacity-30"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <form action={formAction} className="grid gap-3 border-t border-amo-border pt-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-amo-muted">Name</label>
          <input
            name="name"
            required
            className="mt-1 w-full rounded-md border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-amo-muted">Email</label>
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-md border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-amo-muted">Temporary password</label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="mt-1 w-full rounded-md border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-amo-muted">Role</label>
          <select
            name="role"
            defaultValue="MEMBER"
            className="mt-1 w-full rounded-md border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
          >
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
          {state?.success && <p className="text-sm text-amo-lime">{state.success}</p>}
          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-lg bg-gradient-to-r from-amo-lime to-amo-teal px-4 py-2 text-sm font-semibold text-amo-green shadow-[0_4px_14px_rgba(46,204,113,0.25)] transition-transform hover:scale-[1.02] disabled:opacity-60"
          >
            {pending ? "Adding..." : "Add team member"}
          </button>
        </div>
      </form>
    </div>
  );
}
