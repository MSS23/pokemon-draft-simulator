"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ArrowLeft, Eye, RefreshCw } from "lucide-react";
import { DraftService, type DraftState } from "@/lib/draft-service";
import { usePokemonList } from "@/hooks/usePokemon";
import SpectatorDraftGrid from "@/components/spectator/SpectatorDraftGrid";
import SpectatorMode from "@/components/draft/SpectatorMode";
import TeamRoster from "@/components/team/TeamRoster";
import DraftProgress from "@/components/team/DraftProgress";
import { SidebarLayout } from "@/components/layout/SidebarLayout";

export default function SpectateRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.id as string)?.toLowerCase();

  // Validate room code format (should be 6 characters, not a UUID)
  const isValidRoomCode =
    roomCode && roomCode.length === 6 && !/[^a-z0-9]/.test(roomCode);

  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  const { data: pokemon } = usePokemonList();

  // Load draft state
  useEffect(() => {
    const loadDraft = async () => {
      if (!roomCode) return;

      // Validate room code format before making the request
      if (!isValidRoomCode) {
        setError(
          "Invalid room code format. Room codes should be 6 characters (e.g., CC7A5I)",
        );
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const state = await DraftService.getDraftState(roomCode);

        if (!state) {
          setError("Draft room not found");
          return;
        }

        setDraftState(state);
        setError(null);
      } catch (err) {
        console.error("Error loading draft:", err);
        setError("Failed to load draft room");
      } finally {
        setIsLoading(false);
      }
    };

    loadDraft();
  }, [roomCode, isValidRoomCode]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!roomCode || !draftState || !isValidRoomCode) return;

    const unsubscribe = DraftService.subscribeToDraft(roomCode, async (payload) => {
      // Handle draft deletion event
      if (payload?.eventType === 'draft_deleted') {
        console.log('[Spectator] Draft deletion event received:', payload.new);

        // Show notification
        setError('This draft has been deleted by the host');

        // Redirect to spectate list after a short delay
        setTimeout(() => {
          router.push('/spectate?deleted=true');
        }, 2000);

        return; // Don't process further
      }

      try {
        const state = await DraftService.getDraftState(roomCode);
        if (state) {
          // Track pick activity
          if (draftState && state.picks.length > draftState.picks.length) {
            const newPick = state.picks[state.picks.length - 1];
            const team = state.teams.find((t) => t.id === newPick.team_id);

            setRecentActivity((prev) => [
              {
                id: newPick.id,
                type: "pick",
                teamName: team?.name || "Unknown",
                pokemonName: newPick.pokemon_name,
                timestamp: newPick.created_at,
              },
              ...prev.slice(0, 9),
            ]);
          }

          setDraftState(state);
        }
      } catch (err) {
        console.error("Error updating draft state:", err);
      }
    });

    return unsubscribe;
  }, [roomCode, draftState, isValidRoomCode, router]);

  if (isLoading) {
    return (
      <SidebarLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <h2 className="text-xl font-semibold mb-2">Loading Draft...</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Connecting to spectator view
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </SidebarLayout>
    );
  }

  if (error || !draftState) {
    return (
      <SidebarLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                {error || "Draft room not found"}
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
            <div className="absolute top-0 right-0">
              <ThemeToggle />
            </div>
            <div className="flex items-center justify-center gap-2">
              <Eye className="h-6 w-6 text-primary" />
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 dark:from-blue-400 dark:via-blue-300 dark:to-cyan-400 bg-clip-text text-transparent">
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
                {draftState.draft.format === "snake"
                  ? "Snake Draft"
                  : "Auction Draft"}
              </Badge>
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
