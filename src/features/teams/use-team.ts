/**
 * Hooks для бригад/команд мастера (Sprint I.6).
 *
 * Контракт:
 *  - 1 user может иметь 1 team как owner (схема не требует, но в UI ограничиваем).
 *  - useTeamByOwner — получает команду по owner_id (для рендера на странице мастера).
 *  - useTeamMembers — список членов с join к users.
 *  - useCreateTeam / useAddTeamMember / useRemoveTeamMember — мутации.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type Team = Tables<"teams">;
export type TeamMember = Tables<"team_members"> & {
  user: Pick<Tables<"users">, "id" | "first_name" | "last_name" | "avatar_url"> | null;
};

export function teamByOwnerKey(ownerId: string | undefined) {
  return ["team-by-owner", ownerId] as const;
}

export function teamMembersKey(teamId: string | undefined) {
  return ["team-members", teamId] as const;
}

export function useTeamByOwner(ownerId: string | null | undefined) {
  return useQuery<Team | null>({
    queryKey: teamByOwnerKey(ownerId ?? undefined),
    queryFn: async () => {
      if (!ownerId) return null;
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .eq("owner_id", ownerId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!ownerId,
    staleTime: 30_000,
  });
}

export function useTeamMembers(teamId: string | null | undefined) {
  return useQuery<TeamMember[]>({
    queryKey: teamMembersKey(teamId ?? undefined),
    queryFn: async () => {
      if (!teamId) return [];
      const { data, error } = await supabase
        .from("team_members")
        .select("*, user:users!team_members_user_id_fkey(id, first_name, last_name, avatar_url)")
        .eq("team_id", teamId)
        .order("joined_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
    enabled: !!teamId,
    staleTime: 30_000,
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ownerId: string; name: string; description?: string }) => {
      const { data, error } = await supabase
        .from("teams")
        .insert({
          owner_id: input.ownerId,
          name: input.name.trim(),
          description: input.description?.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: teamByOwnerKey(vars.ownerId) });
    },
  });
}

export function useAddTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { teamId: string; userId: string }) => {
      const { error } = await supabase
        .from("team_members")
        .insert({ team_id: input.teamId, user_id: input.userId, role: "member" });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: teamMembersKey(vars.teamId) });
    },
  });
}

export function useRemoveTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { teamId: string; userId: string }) => {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("team_id", input.teamId)
        .eq("user_id", input.userId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: teamMembersKey(vars.teamId) });
    },
  });
}
