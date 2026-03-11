"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Eye,
  Users,
  Clock,
  Tag,
  Search,
  RefreshCw,
  UserPlus,
  Trophy,
  CalendarDays,
  TrendingUp,
  Swords,
} from "lucide-react";
import { DraftService } from "@/lib/draft-service";
import { LeagueService } from "@/lib/league-service";
import { notify } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { createLogger } from '@/lib/logger'
import type { League, Team } from "@/types";

const log = createLogger('WatchDraftsPage')

interface PublicDraft {
  roomCode: string;
  name: string;
  status: string;
  maxTeams: number;
  currentTeams: number;
  format: string;
  createdAt: string;
  description: string | null;
  tags: string[] | null;
  spectatorCount: number;
}

type PublicLeague = League & { teams: Team[]; teamCount: number; draftFormat: string }

export default function WatchDraftsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const initialTab = searchParams.get('tab') === 'leagues' ? 'leagues' : 'drafts';
  const [activeTab, setActiveTab] = useState<"drafts" | "leagues">(initialTab);

  // Draft state
  const [drafts, setDrafts] = useState<PublicDraft[]>([]);
  const [filteredDrafts, setFilteredDrafts] = useState<PublicDraft[]>([]);
  const [isDraftsLoading, setIsDraftsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "setup" | "active"
  >("all");

  // League state
  const [leagues, setLeagues] = useState<PublicLeague[]>([]);
  const [filteredLeagues, setFilteredLeagues] = useState<PublicLeague[]>([]);
  const [isLeaguesLoading, setIsLeaguesLoading] = useState(false);
  const [leagueSearch, setLeagueSearch] = useState("");
  const [leagueStatusFilter, setLeagueStatusFilter] = useState<
    "all" | "active" | "scheduled" | "completed"
  >("all");

  const loadPublicDrafts = async () => {
    try {
      setIsDraftsLoading(true);
      const data = await DraftService.getPublicDrafts({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 50,
      });
      setDrafts(data);
      setFilteredDrafts(data);
    } catch (error) {
      log.error("Error loading public drafts:", error);
      notify.error("Failed to Load", "Could not load public drafts");
    } finally {
      setIsDraftsLoading(false);
    }
  };

  const loadPublicLeagues = async () => {
    try {
      setIsLeaguesLoading(true);
      const data = await LeagueService.getPublicLeagues({
        status: leagueStatusFilter === "all" ? undefined : leagueStatusFilter,
        limit: 30,
      });
      setLeagues(data);
      setFilteredLeagues(data);
    } catch (error) {
      log.error("Error loading public leagues:", error);
      notify.error("Failed to Load", "Could not load public leagues");
    } finally {
      setIsLeaguesLoading(false);
    }
  };

  useEffect(() => {
    loadPublicDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    if (activeTab === "leagues" && leagues.length === 0 && !isLeaguesLoading) {
      loadPublicLeagues();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, leagueStatusFilter]);

  // Reload leagues when filter changes
  useEffect(() => {
    if (activeTab === "leagues") {
      loadPublicLeagues();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueStatusFilter]);

  // Filter drafts
  useEffect(() => {
    const activeDrafts = drafts.filter(
      (d) => d.status !== "completed" && d.status !== "cancelled",
    );

    if (!searchQuery) {
      setFilteredDrafts(activeDrafts);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = activeDrafts.filter(
      (draft) =>
        draft.name.toLowerCase().includes(query) ||
        draft.roomCode.toLowerCase().includes(query) ||
        draft.description?.toLowerCase().includes(query) ||
        draft.tags?.some((tag) => tag.toLowerCase().includes(query)),
    );
    setFilteredDrafts(filtered);
  }, [searchQuery, drafts]);

  // Filter leagues
  useEffect(() => {
    if (!leagueSearch) {
      setFilteredLeagues(leagues);
      return;
    }

    const query = leagueSearch.toLowerCase();
    const filtered = leagues.filter(
      (league) =>
        league.name.toLowerCase().includes(query) ||
        league.draftFormat.toLowerCase().includes(query),
    );
    setFilteredLeagues(filtered);
  }, [leagueSearch, leagues]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "setup":
        return <Badge variant="outline" className="border-warning/40 text-warning">Waiting</Badge>;
      case "active":
        return <Badge className="bg-success text-success-foreground">Live</Badge>;
      case "paused":
        return <Badge variant="outline" className="border-muted-foreground/40">Paused</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getLeagueStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-success text-success-foreground">Active</Badge>;
      case "scheduled":
        return <Badge variant="outline" className="border-blue-400/40 text-blue-500">Upcoming</Badge>;
      case "completed":
        return <Badge variant="outline" className="border-muted-foreground/40">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleWatchDraft = (roomCode: string) => {
    router.push(`/spectate/${roomCode}`);
  };

  const handleJoinDraft = (roomCode: string, e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/join-draft?code=${roomCode}`);
  };

  const canJoinDraft = (draft: PublicDraft) => {
    if (!user) return false;
    return draft.currentTeams < draft.maxTeams && draft.status === "setup";
  };

  const canSpectateDraft = (draft: PublicDraft) => {
    if (!user) return false;
    return (
      draft.currentTeams >= draft.maxTeams ||
      draft.status === "active" ||
      draft.status === "drafting"
    );
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <SidebarLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">Watch Live</h1>
            <p className="text-sm text-muted-foreground">Spectate active drafts in real time.</p>
          </div>

          {/* Tabs: Drafts vs Leagues */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "drafts" | "leagues")}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="drafts" className="flex items-center gap-1.5">
                <Eye className="h-4 w-4" />
                Drafts
              </TabsTrigger>
              <TabsTrigger value="leagues" className="flex items-center gap-1.5">
                <Trophy className="h-4 w-4" />
                Leagues
              </TabsTrigger>
            </TabsList>

            {/* ===== DRAFTS TAB ===== */}
            <TabsContent value="drafts" className="space-y-6 mt-4">
              {/* Filters and Search */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, room code, or tags..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <div className="flex gap-2">
                      {(["all", "setup", "active"] as const).map(
                        (status) => (
                          <Button
                            key={status}
                            onClick={() => setStatusFilter(status)}
                            variant={
                              statusFilter === status ? "default" : "outline"
                            }
                            size="sm"
                          >
                            {status === "all"
                              ? "All"
                              : status === "setup"
                                ? "Waiting"
                                : "Live"}
                          </Button>
                        ),
                      )}
                    </div>
                    <Button
                      onClick={loadPublicDrafts}
                      variant="outline"
                      size="sm"
                      disabled={isDraftsLoading}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${isDraftsLoading ? "animate-spin" : ""}`}
                      />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Drafts List */}
              <div>
                {isDraftsLoading ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">Loading public drafts...</p>
                    </CardContent>
                  </Card>
                ) : filteredDrafts.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Eye className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-semibold text-foreground mb-2">
                        No Public Drafts Found
                      </h3>
                      <p className="text-muted-foreground mb-4">
                        {searchQuery
                          ? "Try a different search term"
                          : "No public drafts available right now"}
                      </p>
                      {searchQuery && (
                        <Button onClick={() => setSearchQuery("")} variant="outline">
                          Clear Search
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {filteredDrafts.map((draft) => (
                      <Card
                        key={draft.roomCode}
                        className="hover:shadow-lg transition-shadow cursor-pointer"
                        onClick={() => handleWatchDraft(draft.roomCode)}
                      >
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <CardTitle className="text-xl">{draft.name}</CardTitle>
                                {getStatusBadge(draft.status)}
                                {draft.status === "active" && (
                                  <Badge variant="destructive" className="animate-pulse">
                                    LIVE
                                  </Badge>
                                )}
                              </div>
                              <CardDescription className="flex items-center gap-4 text-sm flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {draft.currentTeams}/{draft.maxTeams} teams
                                </span>
                                <span className="flex items-center gap-1">
                                  <Eye className="h-3 w-3" />
                                  {draft.spectatorCount} watching
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatTimeAgo(draft.createdAt)}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {draft.format}
                                </Badge>
                              </CardDescription>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Badge variant="secondary" className="font-mono">
                                {draft.roomCode}
                              </Badge>
                              <div className="flex gap-2">
                                {canJoinDraft(draft) && (
                                  <Button
                                    size="sm"
                                    onClick={(e) => handleJoinDraft(draft.roomCode, e)}
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                  >
                                    <UserPlus className="h-3 w-3 mr-1" />
                                    Join
                                  </Button>
                                )}
                                {canSpectateDraft(draft) && (
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleWatchDraft(draft.roomCode);
                                    }}
                                    variant="outline"
                                    className="border-info/40 text-info hover:bg-info/10"
                                  >
                                    <Eye className="h-3 w-3 mr-1" />
                                    Spectate
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardHeader>

                        {(draft.description || draft.tags) && (
                          <CardContent className="pt-0">
                            {draft.description && (
                              <p className="text-sm text-muted-foreground mb-2">
                                {draft.description}
                              </p>
                            )}
                            {draft.tags && draft.tags.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {draft.tags.map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    <Tag className="h-3 w-3 mr-1" />
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ===== LEAGUES TAB ===== */}
            <TabsContent value="leagues" className="space-y-6 mt-4">
              {/* Filters and Search */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search leagues by name or format..."
                        value={leagueSearch}
                        onChange={(e) => setLeagueSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <div className="flex gap-2">
                      {(["all", "active", "scheduled", "completed"] as const).map(
                        (status) => (
                          <Button
                            key={status}
                            onClick={() => setLeagueStatusFilter(status)}
                            variant={
                              leagueStatusFilter === status ? "default" : "outline"
                            }
                            size="sm"
                          >
                            {status === "all"
                              ? "All"
                              : status === "active"
                                ? "Active"
                                : status === "scheduled"
                                  ? "Upcoming"
                                  : "Finished"}
                          </Button>
                        ),
                      )}
                    </div>
                    <Button
                      onClick={loadPublicLeagues}
                      variant="outline"
                      size="sm"
                      disabled={isLeaguesLoading}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${isLeaguesLoading ? "animate-spin" : ""}`}
                      />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Leagues List */}
              <div>
                {isLeaguesLoading ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">Loading public leagues...</p>
                    </CardContent>
                  </Card>
                ) : filteredLeagues.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-semibold text-foreground mb-2">
                        No Public Leagues Found
                      </h3>
                      <p className="text-muted-foreground mb-4">
                        {leagueSearch
                          ? "Try a different search term"
                          : "No public leagues available right now. Leagues become public when their draft is marked as public."}
                      </p>
                      {leagueSearch && (
                        <Button onClick={() => setLeagueSearch("")} variant="outline">
                          Clear Search
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {filteredLeagues.map((league) => (
                      <Card
                        key={league.id}
                        className="hover:shadow-lg transition-shadow cursor-pointer"
                        onClick={() => router.push(`/league/${league.id}`)}
                      >
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <CardTitle className="text-xl">{league.name}</CardTitle>
                                {getLeagueStatusBadge(league.status)}
                                {league.leagueType !== 'single' && (
                                  <Badge variant="outline" className="text-xs">
                                    Conference
                                  </Badge>
                                )}
                              </div>
                              <CardDescription className="flex items-center gap-4 text-sm flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {league.teamCount} teams
                                </span>
                                <span className="flex items-center gap-1">
                                  <CalendarDays className="h-3 w-3" />
                                  Week {league.currentWeek} of {league.totalWeeks}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Swords className="h-3 w-3" />
                                  {(league.settings as Record<string, unknown>)?.matchFormat
                                    ? String((league.settings as Record<string, unknown>).matchFormat).replace(/_/g, ' ')
                                    : 'Bo3'}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {league.draftFormat}
                                </Badge>
                              </CardDescription>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              {league.status === 'active' && (
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                  <TrendingUp className="h-3.5 w-3.5" />
                                  In Progress
                                </div>
                              )}
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/league/${league.id}`);
                                }}
                                variant="outline"
                                className="border-info/40 text-info hover:bg-info/10"
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                Spectate
                              </Button>
                            </div>
                          </div>
                        </CardHeader>

                        {league.teams.length > 0 && (
                          <CardContent className="pt-0">
                            <div className="flex flex-wrap gap-2">
                              {league.teams.slice(0, 6).map((team) => (
                                <Badge key={team.id} variant="secondary" className="text-xs">
                                  {team.name}
                                </Badge>
                              ))}
                              {league.teams.length > 6 && (
                                <Badge variant="outline" className="text-xs">
                                  +{league.teams.length - 6} more
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Help Text */}
              <Card className="bg-info/5 border-info/20">
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <Trophy className="h-4 w-4 text-info mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium mb-0.5">League Spectating</p>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        Follow public leagues to view standings, weekly fixtures, match results,
                        team rosters, and playoff brackets. You can view all league data as a spectator
                        without participating.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Help Text for Drafts (only on drafts tab) */}
          {activeTab === "drafts" && (
            <div className="space-y-4">
              <Card className="bg-info/5 border-info/20">
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <Eye className="h-4 w-4 text-info mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium mb-0.5">Spectator Mode</p>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        Click any draft to watch it live. You&apos;ll see all picks,
                        team rosters, and draft progress in real-time without participating.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {user ? (
                <Card className="bg-success/5 border-success/20">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <UserPlus className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium mb-0.5">Join as Participant or Spectate</p>
                        <p className="text-muted-foreground text-xs leading-relaxed">
                          You can join drafts with available team slots using the &quot;Join&quot; button.
                          For full or active drafts, use &quot;Spectate&quot; to watch as a spectator.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-warning/5 border-warning/20">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <Users className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium mb-0.5">Sign In to Join Drafts</p>
                        <p className="text-muted-foreground text-xs leading-relaxed">
                          Guests can spectate any public draft. To join as a participant, please sign in or create an account.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
      </div>
    </SidebarLayout>
  );
}
