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
      <ul className="divide-y divide-slate-100">
        {users.map((user) => (
          <li key={user.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
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
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm disabled:opacity-60"
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
                className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-30"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <form action={formAction} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">Name</label>
          <input
            name="name"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Email</label>
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Temporary password</label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Role</label>
          <select
            name="role"
            defaultValue="MEMBER"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
          >
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state?.success && <p className="text-sm text-emerald-600">{state.success}</p>}
          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {pending ? "Adding..." : "Add team member"}
          </button>
        </div>
      </form>
    </div>
  );
}
