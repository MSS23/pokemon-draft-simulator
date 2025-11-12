"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Search, Users, Clock, Eye, Play, Trophy, Hash } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SidebarLayout } from "@/components/layout/SidebarLayout";

interface PublicDraft {
  id: string;
  room_code?: string; // Optional until database migration is run
  name: string;
  description?: string;
  format: string;
  status: string;
  max_teams: number;
  current_round: number;
  spectator_count: number;
  tags?: string[];
  teams_joined: number;
  total_picks: number;
  last_activity: string;
  created_at: string;
}

export default function SpectatePage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<PublicDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchCode, setSearchCode] = useState("");
  const [searchFilter, setSearchFilter] = useState("");

  useEffect(() => {
    loadPublicDrafts();

    // Set up real-time subscription for public drafts
    if (supabase) {
      const channel = supabase
        .channel("public-drafts-list")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "drafts",
            filter: "is_public=eq.true",
          },
          () => {
            loadPublicDrafts();
          },
        )
        .subscribe();

      return () => {
        if (supabase) {
          supabase.removeChannel(channel);
        }
      };
    }
  }, []);

  const loadPublicDrafts = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("active_public_drafts")
        .select("*")
        .limit(20);

      if (error) {
        console.error("Error loading public drafts:", error);
      } else {
        setDrafts(data || []);
      }
    } catch (error) {
      console.error("Failed to load public drafts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinByCode = () => {
    if (searchCode.trim()) {
      router.push(`/spectate/${searchCode.toLowerCase().trim()}`);
    }
  };

  const handleJoinDraft = (roomCode: string | undefined, draftId: string) => {
    // Prefer room_code, but fallback to fetching it from the draft if not available
    if (roomCode) {
      router.push(`/spectate/${roomCode.toLowerCase()}`);
    } else {
      // Fallback: fetch the draft to get its room_code
      console.warn(
        "room_code not available in view, fetching from drafts table",
      );
      if (supabase) {
        supabase
          .from("drafts")
          .select("room_code")
          .eq("id", draftId)
          .single()
          .then(
            ({
              data,
              error,
            }: {
              data: { room_code: string } | null;
              error: any;
            }) => {
              if (error || !data?.room_code) {
                console.error("Failed to fetch room_code:", error);
              } else {
                router.push(`/spectate/${data.room_code.toLowerCase()}`);
              }
            },
          );
      }
    }
  };

  const filteredDrafts = drafts.filter(
    (draft) =>
      draft.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      draft.description?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      draft.tags?.some((tag) =>
        tag.toLowerCase().includes(searchFilter.toLowerCase()),
      ),
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "setup":
        return "bg-blue-500";
      case "paused":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active":
        return "Live";
      case "setup":
        return "Waiting";
      case "paused":
        return "Paused";
      default:
        return status;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  return (
    <SidebarLayout>
      <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="relative text-center mb-8">
            <div className="absolute top-0 right-0">
              <ThemeToggle />
            </div>

            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 dark:from-blue-400 dark:via-blue-300 dark:to-cyan-400 bg-clip-text text-transparent mb-4">
              🎮 Spectate Drafts
            </h1>
            <p className="text-xl text-slate-700 dark:text-slate-300 mb-6 max-w-2xl mx-auto">
              Watch live Pokémon drafts and learn from the pros! Join as a
              spectator to see picks in real-time.
            </p>
          </div>

          {/* Join by Code */}
          <Card className="mb-8 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hash className="h-5 w-5" />
                Join by Room Code
              </CardTitle>
              <CardDescription>
                Enter a specific room code to spectate a private draft
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter room code (e.g., ABC123)"
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinByCode()}
                  className="uppercase"
                  maxLength={6}
                />
                <Button
                  onClick={handleJoinByCode}
                  disabled={!searchCode.trim()}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Spectate
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Search and Filter */}
          <Card className="mb-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search drafts by name, description, or tags..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {/* Active Drafts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Card
                  key={i}
                  className="animate-pulse bg-white/80 dark:bg-slate-900/80"
                >
                  <CardHeader>
                    <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : filteredDrafts.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <Trophy className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  No Active Drafts
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {searchFilter
                    ? "No drafts match your search."
                    : "No public drafts are currently active."}
                </p>
              </div>
            ) : (
              filteredDrafts.map((draft) => (
                <Card
                  key={draft.id}
                  className="group hover:shadow-lg transition-all duration-200 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-2 hover:border-blue-300 dark:hover:border-blue-600"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {draft.name}
                        </CardTitle>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge
                            className={`${getStatusColor(draft.status)} text-white text-xs`}
                          >
                            {getStatusText(draft.status)}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {draft.format.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                        <Eye className="h-4 w-4" />
                        {draft.spectator_count}
                      </div>
                    </div>
                    {draft.description && (
                      <CardDescription className="text-sm">
                        {draft.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-gray-500" />
                          <span>
                            {draft.teams_joined}/{draft.max_teams} teams
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Play className="h-4 w-4 text-gray-500" />
                          <span>Round {draft.current_round}</span>
                        </div>
                      </div>

                      {draft.total_picks > 0 && (
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {draft.total_picks} picks made
                        </div>
                      )}

                      {draft.tags && draft.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {draft.tags.slice(0, 3).map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="text-xs"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          {formatTimeAgo(draft.last_activity)}
                        </div>
                        <Button
                          size="sm"
                          onClick={() =>
                            handleJoinDraft(draft.room_code, draft.id)
                          }
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Watch
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Footer Info */}
          <div className="mt-12 text-center">
            <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-6">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  👁️ Spectator Mode
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  As a spectator, you can watch live picks, see team builds, and
                  follow auction bidding in real-time. You won't be able to
                  participate, but you can learn strategies from experienced
                  players!
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
