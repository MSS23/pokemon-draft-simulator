"use client";

import { useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Eye, RefreshCw } from "lucide-react";
import { usePokemonList } from "@/hooks/usePokemon";
import { useDraftStateWithRealtime } from "@/hooks/useDraftRealtime";
import { DraftConnectionStatusBadge } from "@/components/draft/ConnectionStatus";
import SpectatorDraftGrid from "@/components/spectator/SpectatorDraftGrid";
import SpectatorMode from "@/components/draft/SpectatorMode";
import TeamRoster from "@/components/team/TeamRoster";
import DraftProgress from "@/components/team/DraftProgress";
import { SidebarLayout } from "@/components/layout/SidebarLayout";
import type { DraftEvent } from "@/lib/draft-realtime";

export default function SpectateRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.id as string)?.toLowerCase();

  // Validate room code format (should be 6 characters, not a UUID)
  const isValidRoomCode =
    roomCode && roomCode.length === 6 && !/[^a-z0-9]/.test(roomCode);

  const [error, setError] = useState<string | null>(null);
  const [recentActivity, setRecentActivity] = useState<
    Array<{
      id: string;
      type: "pick" | "bid" | "auction_start" | "auction_end" | "join" | "leave";
      teamName: string;
      pokemonName?: string;
      amount?: number;
      timestamp: string;
    }>
  >([]);

  usePokemonList();

  // Generate a spectator user ID for presence tracking
  const spectatorId = useMemo(() => {
    if (typeof window === "undefined") return null;
    let id = sessionStorage.getItem("spectator-id");
    if (!id) {
      id = `spectator-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem("spectator-id", id);
    }
    return id;
  }, []);

  // Track pick activity from real-time events
  const handlePickEvent = useCallback((event: DraftEvent) => {
    const data = event.data;
    setRecentActivity((prev) => [
      {
        id: (data.id as string) || `pick-${Date.now()}`,
        type: "pick",
        teamName: (data.team_name as string) || "Unknown",
        pokemonName: (data.pokemon_name as string) || "Unknown",
        timestamp: (data.created_at as string) || new Date().toISOString(),
      },
      ...prev.slice(0, 9),
    ]);
  }, []);

  // Handle draft deletion
  const handleDraftDeleted = useCallback(() => {
    setError("This draft has been deleted by the host");
    setTimeout(() => {
      router.push("/spectate?deleted=true");
    }, 2000);
  }, [router]);

  // Validate room code format before subscribing
  const validatedRoomCode = isValidRoomCode ? roomCode : null;

  // Single hook handles initial fetch + real-time subscription
  const {
    draftState,
    isLoading,
    loadError,
    connectionStatus,
  } = useDraftStateWithRealtime(validatedRoomCode, spectatorId, {
    enabled: !!validatedRoomCode,
    onPickEvent: handlePickEvent,
    onDraftDeleted: handleDraftDeleted,
  });

  // Show room code validation error
  const displayError = error || (roomCode && !isValidRoomCode
    ? "Invalid room code format. Room codes should be 6 characters (e.g., CC7A5I)"
    : loadError?.message || (!draftState && !isLoading ? "Draft room not found" : null));

  if (isLoading) {
    return (
      <SidebarLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <h2 className="text-xl font-semibold mb-2">Loading Draft...</h2>
                <p className="text-sm text-muted-foreground">
                  Connecting to spectator view
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </SidebarLayout>
    );
  }

  if (displayError || !draftState) {
    return (
      <SidebarLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                {displayError || "Draft room not found"}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => router.push("/spectate")}
                  variant="outline"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to List
                </Button>
                <Button onClick={() => window.location.reload()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </SidebarLayout>
    );
  }

  const currentPhase =
    draftState.draft.status === "setup"
      ? "setup"
      : draftState.draft.status === "active" &&
          draftState.draft.format === "auction"
        ? "auction"
        : draftState.draft.status === "active"
          ? "drafting"
          : "completed";

  const currentTurn = draftState.draft.current_turn || 1;
  const currentTeam = draftState.teams.find((t) => {
    const teamOrder =
      Math.floor((currentTurn - 1) % draftState.teams.length) + 1;
    return t.draft_order === teamOrder;
  });

  return (
    <SidebarLayout>
      <div className="min-h-screen bg-background transition-colors duration-500">
        <div className="container mx-auto px-4 py-6">
          {/* Header */}
          <div className="relative text-center mb-6">
            <div className="absolute top-0 left-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/spectate")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Eye className="h-6 w-6 text-primary" />
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight brand-gradient-text">
                Spectating: {roomCode.toUpperCase()}
              </h1>
            </div>
            <div className="flex justify-center gap-2 mt-2">
              <Badge
                variant={
                  draftState.draft.status === "active" ? "default" : "secondary"
                }
              >
                {draftState.draft.status.charAt(0).toUpperCase() +
                  draftState.draft.status.slice(1)}
              </Badge>
              <Badge variant="outline">
                {draftState.draft.format === "auction"
                  ? "Auction Draft"
                  : (draftState.draft.settings as { scoringSystem?: string })?.scoringSystem === "tiered"
                  ? "Tiered Draft"
                  : "Points Draft"}
              </Badge>
              <DraftConnectionStatusBadge status={connectionStatus} showLabel={false} />
            </div>
          </div>

          {/* Spectator Mode Component */}
          <div className="mb-6">
            <SpectatorMode
              draftId={roomCode}
              currentPhase={currentPhase}
              participantCount={draftState.participants.length}
              currentAction={
                draftState.draft.status === "active" && currentTeam
                  ? {
                      type: "pick",
                      teamName: currentTeam.name,
                      timeRemaining: 60,
                    }
                  : undefined
              }
              recentActivity={recentActivity}
            />
          </div>

          {/* Draft Progress */}
          {draftState.draft.status === "active" && (
            <div className="mb-6">
              <DraftProgress
                currentTurn={currentTurn}
                totalTeams={draftState.teams.length}
                maxRounds={draftState.draft.settings?.maxPokemonPerTeam || 6}
                draftStatus={
                  draftState.draft.status === "active" ? "drafting" : "waiting"
                }
                timeRemaining={60}
                teams={draftState.teams.map((team) => {
                  const participant = draftState.participants.find(
                    (p) => p.team_id === team.id,
                  );
                  const teamPicks = draftState.picks
                    .filter((pick) => pick.team_id === team.id)
                    .map((pick) => pick.pokemon_id);

                  return {
                    id: team.id,
                    name: team.name,
                    userName: participant?.display_name || "Unknown",
                    draftOrder: team.draft_order,
                    picks: teamPicks,
                    budgetRemaining: team.budget_remaining,
                  };
                })}
              />
            </div>
          )}

          {/* Team Rosters */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {draftState.teams.map((team) => {
              const participant = draftState.participants.find(
                (p) => p.team_id === team.id,
              );
              const teamPicks = draftState.picks
                .filter((pick) => pick.team_id === team.id)
                .map((pick) => pick.pokemon_id);

              return (
                <TeamRoster
                  key={team.id}
                  team={{
                    id: team.id,
                    name: team.name,
                    userName: participant?.display_name || "Unknown",
                    draftOrder: team.draft_order,
                    picks: teamPicks,
                  }}
                  isCurrentTeam={currentTeam?.id === team.id}
                  isUserTeam={false}
                  showTurnIndicator={draftState.draft.status === "active"}
                  maxPokemonPerTeam={
                    draftState.draft.settings?.maxPokemonPerTeam || 6
                  }
                />
              );
            })}
          </div>

          {/* Pokemon Pool */}
          <div className="mb-6">
            <SpectatorDraftGrid
              draftData={{
                id: draftState.draft.id,
                format: draftState.draft.ruleset || "vgc-reg-h",
                settings: draftState.draft.settings || {},
                picks: draftState.picks,
                teams: draftState.teams,
              }}
            />
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
