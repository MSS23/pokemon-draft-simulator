"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
  SelectSeparator,
  SelectGroup,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Clock,
  Zap,
  Trophy,
  Shield,
  Info,
  Eye,
  Tag,
  Download,
} from "lucide-react";
import { notify } from "@/lib/notifications";
import {
  POKEMON_FORMATS,
  getFormatById,
  getPopularFormats,
  DEFAULT_FORMAT,
} from "@/lib/formats";
// import { generateRoomCode } from '@/lib/room-utils'
import { useHydrationFix } from "@/lib/hydration-fix";
import CSVUpload from "@/components/draft/CSVUpload";
import {
  exportFormatWithProgress,
  downloadFormatCSV,
  createCustomFormatTemplate,
} from "@/lib/format-export";
import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { useAuth } from "@/contexts/AuthContext";
import { createLogger } from '@/lib/logger'
import { TierDefinition } from '@/types'
import { DEFAULT_TIER_CONFIG } from '@/lib/tier-utils'

const log = createLogger('CreateDraftPage')

export default function CreateDraftPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    userName: "",
    teamName: "",
    maxTeams: "4",
    draftType: "points",
    timeLimit: "0",
    pokemonPerTeam: "6",
    budgetPerTeam: "100",
    formatId: DEFAULT_FORMAT,
    isPublic: true,
    description: "",
    tags: "",
    password: "",
    useCustomFormat: false,
    createLeague: true,
    splitIntoConferences: false,
    leagueWeeks: "4",
    scoringSystem: "budget" as "budget" | "tiered", // derived from draftType, kept for tier config state
  });
  const [tierConfig, setTierConfig] = useState<TierDefinition[]>(DEFAULT_TIER_CONFIG);

  const [customPricing, setCustomPricing] = useState<Record<
    string,
    number
  > | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Apply hydration fix for browser extensions
  useHydrationFix();

  // Pre-fill user data when authenticated
  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading || !user) return;

    // Pre-fill userName with display name if available
    if (user.user_metadata?.display_name) {
      setFormData((prev) => ({
        ...prev,
        userName: user.user_metadata.display_name,
      }));
    } else if (user.email) {
      setFormData((prev) => ({
        ...prev,
        userName: user.email?.split("@")[0] || "User",
      }));
    }
  }, [authLoading, user]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => {
      // Prevent unnecessary updates if value hasn't changed
      if (prev[field as keyof typeof prev] === value) {
        return prev;
      }

      const newData = { ...prev, [field]: value };

      // When switching draft type, sync scoringSystem and enforce constraints
      if (field === "draftType") {
        if (value === "tiered") {
          newData.scoringSystem = "tiered"
        } else {
          newData.scoringSystem = "budget"
          // Enforce min 6 for points/auction snake-style picks
          if (value !== "auction" && parseInt(prev.pokemonPerTeam) < 6) {
            newData.pokemonPerTeam = "6"
          }
        }
      }

      return newData;
    });
  };

  const handleExportFormat = async () => {
    if (!selectedFormat) return;

    setIsExporting(true);
    setExportProgress(0);

    try {
      const csvContent = await exportFormatWithProgress(
        formData.formatId,
        (loaded, total) => {
          setExportProgress(Math.round((loaded / total) * 100));
        },
      );

      downloadFormatCSV(formData.formatId, csvContent);
      notify.success(
        "Export Complete",
        `${selectedFormat.shortName} format exported successfully!`,
      );
    } catch (error) {
      log.error("Export error:", error);
      notify.error(
        "Export Failed",
        error instanceof Error ? error.message : "Failed to export format",
      );
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const _handleDownloadTemplate = () => {
    const template = createCustomFormatTemplate();
    const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "custom-format-template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify.success(
      "Template Downloaded",
      "Edit the CSV and upload it to create your custom format",
    );
  };

  // Room code generation moved to centralized utility

  const formatTimeLimit = (seconds: string): string => {
    const time = parseInt(seconds);
    if (time === 0) return "No limit";
    if (time < 60) return `${time}s`;
    if (time < 3600) return `${Math.floor(time / 60)}m`;
    return `${Math.floor(time / 3600)}h`;
  };

  const selectedFormat = getFormatById(formData.formatId);
  const popularFormats = getPopularFormats();

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "vgc":
        return "🏆";
      case "smogon":
        return "⚔️";
      case "custom":
        return "🎯";
      default:
        return "📋";
    }
  };

  const getDifficultyColor = (complexity: number) => {
    if (complexity <= 2)
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (complexity <= 3)
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  };

  const handleCreateDraft = async () => {
    if (!formData.userName.trim() || !formData.teamName.trim()) {
      notify.warning(
        "Missing Information",
        "Please enter both your name and team name",
      );
      return;
    }

    if (formData.useCustomFormat && !customPricing) {
      notify.warning(
        "Missing Draft Pool",
        "Please upload a CSV file or paste a Google Sheets link",
      );
      return;
    }

    // Enforce minimum Pokemon limit for non-auction drafts
    const pokemonCount = parseInt(formData.pokemonPerTeam);
    if (formData.draftType !== "auction" && pokemonCount < 6) {
      notify.warning(
        "Invalid Pokemon Count",
        "Points and tiered drafts require at least 6 Pokémon per team",
      );
      return;
    }

    setIsCreating(true);
    try {
      const { DraftService } = await import("@/lib/draft-service");

      const { roomCode } = await DraftService.createDraft({
        name: `${formData.userName}'s Draft`,
        hostName: formData.userName,
        teamName: formData.teamName,
        settings: {
          maxTeams: parseInt(formData.maxTeams),
          draftType: formData.draftType as "tiered" | "points" | "auction",
          timeLimit: parseInt(formData.timeLimit),
          pokemonPerTeam: parseInt(formData.pokemonPerTeam),
          budgetPerTeam: parseInt(formData.budgetPerTeam),
          formatId: customPricing ? "custom" : formData.formatId,
          // Scoring system
          scoringSystem: formData.draftType === 'tiered' ? 'tiered' : 'budget',
          tierConfig: formData.draftType === 'tiered' ? { tiers: tierConfig } : undefined,
          // League settings (stored in draft settings for league creation later)
          createLeague: formData.createLeague,
          splitIntoConferences: formData.splitIntoConferences,
          leagueWeeks: parseInt(formData.leagueWeeks),
        },
        isPublic: formData.isPublic,
        description: formData.description || null,
        tags: formData.tags
          ? formData.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : null,
        password:
          !formData.isPublic && formData.password ? formData.password : null,
        customFormat:
          customPricing
            ? {
                name: `${formData.userName}'s Custom Format`,
                description:
                  formData.description || "Custom Pokemon pricing format",
                pokemonPricing: customPricing,
              }
            : undefined,
      });

      // Grant access to the draft for the host
      const { grantDraftAccess } = await import("@/lib/draft-access");
      grantDraftAccess(roomCode, true);

      notify.success("Draft Created!", `Room ${roomCode} is ready for players`);
      router.push(
        `/draft/${roomCode.toLowerCase()}?userName=${encodeURIComponent(formData.userName)}&teamName=${encodeURIComponent(formData.teamName)}&isHost=true`,
      );
    } catch (error) {
      log.error("Failed to create draft:", error);
      notify.error(
        "Failed to Create Draft",
        error instanceof Error
          ? error.message
          : "Failed to create draft room. Please try again.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const isFormValid = formData.userName.trim() && formData.teamName.trim();

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <SidebarLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Checking authentication...</p>
          </div>
        </div>
      </SidebarLayout>
    );
  }

  // Show login required if not authenticated
  if (!user) {
    return (
      <SidebarLayout>
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-yellow-500" />
                Authentication Required
              </CardTitle>
              <CardDescription>
                Please sign in to create a draft
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Creating a draft requires an authenticated account. This ensures that:
              </p>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>You can manage and track your drafts</li>
                <li>Teams can join your draft room</li>
                <li>Your draft settings are saved securely</li>
              </ul>
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => router.push("/")}
                className="flex-1"
              >
                Go Back Home
              </Button>
              <Button
                onClick={() => router.push("/auth/login")}
                className="flex-1"
              >
                Sign In
              </Button>
            </CardFooter>
          </Card>
        </div>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout>
      <div className="min-h-screen bg-background transition-colors duration-500">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <p className="text-xs font-bold text-primary uppercase tracking-[0.2em] mb-2">New Draft</p>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">
              Create Draft Room
            </h1>
            <p className="text-sm text-muted-foreground">
              Set up a multiplayer Pokémon draft for your team.
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Draft Configuration</CardTitle>
                <CardDescription>
                  Configure your draft settings and create a room for teams to
                  join
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* User Identity */}
                <div id="tour-create-identity" className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Your Identity
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="userName" className="text-sm font-medium">
                        Your Name
                      </Label>
                      <Input
                        id="userName"
                        placeholder="Enter your name"
                        value={formData.userName}
                        onChange={(e) =>
                          handleInputChange("userName", e.target.value)
                        }
                        aria-required="true"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="teamName" className="text-sm font-medium">
                        Team Name
                      </Label>
                      <Input
                        id="teamName"
                        placeholder="Enter team name"
                        value={formData.teamName}
                        onChange={(e) =>
                          handleInputChange("teamName", e.target.value)
                        }
                        aria-required="true"
                      />
                    </div>
                  </div>
                </div>

                {/* Draft Settings */}
                <div id="tour-create-settings" className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-primary" />
                    Draft Settings
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="maxTeams" className="text-sm font-medium">
                        Number of Teams
                      </Label>
                      <Select
                        value={formData.maxTeams}
                        onValueChange={(value) =>
                          handleInputChange("maxTeams", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select number of teams" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 19 }, (_, i) => i + 2).map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n} Teams
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-1">
                      <Label className="text-sm font-medium">Draft Type</Label>
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          { value: "tiered", icon: "🏆", title: "Tiered Draft", desc: "Tiers define pick costs — spend your budget on any combination of tiers" },
                          { value: "points", icon: "💰", title: "Points Draft", desc: "Each Pokémon costs points — spend your budget" },
                          { value: "auction", icon: "🔨", title: "Auction Draft", desc: "Nominate & bid on Pokémon in real-time" },
                        ].map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleInputChange("draftType", opt.value)}
                            className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                              formData.draftType === opt.value
                                ? "border-primary bg-primary/10"
                                : "border-border bg-card hover:border-primary/50"
                            }`}
                          >
                            <span className="text-xl mt-0.5">{opt.icon}</span>
                            <div>
                              <div className="font-semibold text-sm">{opt.title}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Format/Ruleset Selection */}
                <div id="tour-create-format" className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Pokemon Format & Rules
                  </h3>

                  <div className="space-y-3">
                    {/* Import Draft Pool (CSV / Google Sheets) — always visible */}
                    <CSVUpload
                      onPricingParsed={(pricing) => {
                        setCustomPricing(pricing);
                        handleInputChange("useCustomFormat", true);
                      }}
                      onClear={() => {
                        setCustomPricing(null);
                        handleInputChange("useCustomFormat", false);
                      }}
                    />

                    {/* Show format selector when no custom pricing imported */}
                    {!customPricing && (
                      <>
                        <div className="relative flex items-center gap-2 py-1">
                          <div className="flex-1 border-t border-border" />
                          <span className="text-xs text-muted-foreground px-2">or use a preset format</span>
                          <div className="flex-1 border-t border-border" />
                        </div>

                        <div className="space-y-2">
                          <Label
                            htmlFor="format"
                            className="text-sm font-medium"
                          >
                            Competitive Format
                          </Label>
                          <Select
                            value={formData.formatId}
                            onValueChange={(value) =>
                              handleInputChange("formatId", value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select format" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectLabel>Popular Formats</SelectLabel>
                                {popularFormats.map((format) => (
                                  <SelectItem key={format.id} value={format.id}>
                                    {getCategoryIcon(format.category)} {format.shortName}
                                    {format.meta.isOfficial && " ⭐"}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                              <SelectSeparator />
                              <SelectGroup>
                                <SelectLabel>All Formats</SelectLabel>
                                {POKEMON_FORMATS.filter(
                                  (f) =>
                                    !popularFormats.some((p) => p.id === f.id),
                                ).map((format) => (
                                  <SelectItem key={format.id} value={format.id}>
                                    {getCategoryIcon(format.category)} {format.shortName}
                                    {format.meta.isOfficial && " ⭐"}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {/* Format Information Display */}
                    {selectedFormat && !customPricing && (
                      <div className="p-3 bg-card rounded-lg border">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">
                              {getCategoryIcon(selectedFormat.category)}
                            </span>
                            <div>
                              <h4 className="font-semibold text-sm">
                                {selectedFormat.name}
                              </h4>
                              <p className="text-xs text-muted-foreground">
                                Generation {selectedFormat.generation} •{" "}
                                {selectedFormat.gameType}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {selectedFormat.meta.isOfficial && (
                              <Badge variant="outline" className="text-xs">
                                Official
                              </Badge>
                            )}
                            <Badge
                              className={`text-xs ${getDifficultyColor(selectedFormat.meta.complexity)}`}
                            >
                              {selectedFormat.meta.complexity <= 2
                                ? "Simple"
                                : selectedFormat.meta.complexity <= 3
                                  ? "Medium"
                                  : "Complex"}
                            </Badge>
                          </div>
                        </div>

                        <p className="text-xs text-foreground mb-3">
                          {selectedFormat.description}
                        </p>

                        <div className="flex flex-wrap gap-2 text-xs">
                          <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded">
                            <Info className="h-3 w-3" />
                            <span>
                              Cost: {selectedFormat.costConfig.minCost}-
                              {selectedFormat.costConfig.maxCost}
                            </span>
                          </div>
                          {selectedFormat.ruleset.legendaryPolicy ===
                            "banned" && (
                            <div className="px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded">
                              No Legendaries
                            </div>
                          )}
                          {selectedFormat.ruleset.mythicalPolicy ===
                            "banned" && (
                            <div className="px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded">
                              No Mythicals
                            </div>
                          )}
                          {selectedFormat.ruleset.paradoxPolicy ===
                            "banned" && (
                            <div className="px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded">
                              No Paradox
                            </div>
                          )}
                          {selectedFormat.ruleset.bannedTiers.length > 0 && (
                            <div className="px-2 py-1 bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200 rounded">
                              Bans:{" "}
                              {selectedFormat.ruleset.bannedTiers.join(", ")}
                            </div>
                          )}
                        </div>

                        {/* Export Format Button */}
                        <div className="mt-3 pt-3 border-t">
                          <Button
                            onClick={handleExportFormat}
                            disabled={isExporting}
                            variant="outline"
                            size="sm"
                            className="w-full border-primary/30 text-primary hover:bg-primary/10"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            {isExporting
                              ? `Exporting... ${exportProgress}%`
                              : "Export Pokemon List (CSV)"}
                          </Button>
                          <p className="text-xs text-muted-foreground mt-2">
                            Download this format&apos;s Pokemon list with draft
                            points. Edit it to create your own custom format!
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Spectator Mode */}
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Eye className="h-5 w-5 text-primary" />
                    Spectator Mode
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="isPublic"
                        checked={formData.isPublic}
                        onChange={(e) =>
                          handleInputChange("isPublic", e.target.checked)
                        }
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor="isPublic"
                          className="text-sm font-medium cursor-pointer"
                        >
                          Make this draft public
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Allow anyone to watch this draft in real-time as a
                          spectator. They won&apos;t be able to participate,
                          only observe.
                        </p>
                      </div>
                    </div>

                    {!formData.isPublic && (
                      <div className="space-y-2">
                        <Label
                          htmlFor="password"
                          className="text-sm font-medium"
                        >
                          Password (Optional)
                        </Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="Set a password to protect this private draft"
                          value={formData.password}
                          onChange={(e) =>
                            handleInputChange("password", e.target.value)
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          If set, users will need this password to join your
                          private draft
                        </p>
                      </div>
                    )}

                    {formData.isPublic && (
                      <>
                        <div className="space-y-2">
                          <Label
                            htmlFor="description"
                            className="text-sm font-medium"
                          >
                            Description (Optional)
                          </Label>
                          <textarea
                            id="description"
                            placeholder="Describe your draft (e.g., 'High-level VGC tournament draft')"
                            value={formData.description}
                            onChange={(e) =>
                              handleInputChange("description", e.target.value)
                            }
                            rows={3}
                            className="w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label
                            htmlFor="tags"
                            className="text-sm font-medium flex items-center gap-1"
                          >
                            <Tag className="h-3 w-3" />
                            Tags (Optional)
                          </Label>
                          <Input
                            id="tags"
                            placeholder="e.g., tournament, competitive, casual (comma-separated)"
                            value={formData.tags}
                            onChange={(e) =>
                              handleInputChange("tags", e.target.value)
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            Separate tags with commas to help others find your
                            draft
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Time Settings */}
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    Time Settings
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="timeLimit"
                        className="text-sm font-medium"
                      >
                        Pick Time Limit
                      </Label>
                      <Select
                        value={formData.timeLimit}
                        onValueChange={(value) =>
                          handleInputChange("timeLimit", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select time limit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">No limit (default)</SelectItem>
                          <SelectItem value="30">30 seconds</SelectItem>
                          <SelectItem value="60">1 minute</SelectItem>
                          <SelectItem value="90">90 seconds</SelectItem>
                          <SelectItem value="120">2 minutes</SelectItem>
                          <SelectItem value="300">5 minutes</SelectItem>
                          <SelectItem value="600">10 minutes</SelectItem>
                          <SelectItem value="1800">30 minutes</SelectItem>
                          <SelectItem value="3600">1 hour</SelectItem>
                          <SelectItem value="7200">2 hours</SelectItem>
                          <SelectItem value="14400">4 hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="pokemonPerTeam"
                        className="text-sm font-medium"
                      >
                        Pokémon per Team{" "}
                        {formData.draftType === "points" && (
                          <span className="text-xs text-muted-foreground">
                            (min 6)
                          </span>
                        )}
                        {formData.draftType === "tiered" && (
                          <span className="text-xs text-muted-foreground">
                            (set by tier config)
                          </span>
                        )}
                      </Label>
                      <Select
                        value={formData.pokemonPerTeam}
                        onValueChange={(value) =>
                          handleInputChange("pokemonPerTeam", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Pokémon per team" />
                        </SelectTrigger>
                        <SelectContent>
                          {formData.draftType === "auction" && (
                            <>
                              <SelectItem value="3">3 Pokémon</SelectItem>
                              <SelectItem value="4">4 Pokémon</SelectItem>
                              <SelectItem value="5">5 Pokémon</SelectItem>
                            </>
                          )}
                          <SelectItem value="6">6 Pokémon</SelectItem>
                          <SelectItem value="9">9 Pokémon</SelectItem>
                          <SelectItem value="11">11 Pokémon</SelectItem>
                          <SelectItem value="12">12 Pokémon</SelectItem>
                          <SelectItem value="15">15 Pokémon</SelectItem>
                        </SelectContent>
                      </Select>
                      {formData.draftType === "points" &&
                        parseInt(formData.pokemonPerTeam) < 6 && (
                          <p className="text-xs text-orange-600 dark:text-orange-400">
                            ⚠️ Points drafts require at least 6 Pokémon per team
                          </p>
                        )}
                    </div>
                    {/* Budget field — shown for all draft types */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="budgetPerTeam"
                        className="text-sm font-medium"
                      >
                        Budget per Team (Points){" "}
                        <span className="text-xs text-muted-foreground">
                          {formData.draftType === "tiered"
                            ? "Total tier points to spend"
                            : "Used to draft Pokémon"}
                        </span>
                      </Label>
                      <Select
                        value={formData.budgetPerTeam}
                        onValueChange={(value) =>
                          handleInputChange("budgetPerTeam", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select budget per team" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="50">50 points</SelectItem>
                          <SelectItem value="75">75 points</SelectItem>
                          <SelectItem value="100">100 points (Default)</SelectItem>
                          <SelectItem value="120">120 points</SelectItem>
                          <SelectItem value="150">150 points</SelectItem>
                          <SelectItem value="200">200 points</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {formData.draftType === "tiered"
                          ? "Each pick deducts that tier's point cost. Any combination is valid as long as you stay within budget."
                          : "Each Pokémon has a cost based on its strength. Budget determines what you can draft."}
                      </p>
                    </div>
                  </div>

                  {/* Tier Configuration — only shown for tiered draft */}
                  {formData.draftType === "tiered" && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Tier Configuration</Label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setTierConfig(DEFAULT_TIER_CONFIG)}
                            className="text-xs text-muted-foreground hover:text-foreground underline"
                          >
                            Reset to default
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const newTier: TierDefinition = {
                                name: String.fromCharCode(65 + tierConfig.length),
                                label: `Tier ${String.fromCharCode(65 + tierConfig.length)}`,
                                cost: 1,
                                minCost: 0,
                                color: '#94a3b8',
                              }
                              setTierConfig([...tierConfig, newTier])
                            }}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            + Add tier
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/60">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-16">Tier</th>
                              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Label</th>
                              <th className="text-center px-3 py-2 font-medium text-xs text-muted-foreground w-28">
                                Format Cost ≥
                                <span className="block text-[10px] font-normal">(classifies pokemon)</span>
                              </th>
                              <th className="text-center px-3 py-2 font-medium text-xs text-muted-foreground w-28">
                                Pick Cost
                                <span className="block text-[10px] font-normal">(deducted from budget)</span>
                              </th>
                              <th className="text-center px-3 py-2 font-medium text-xs text-muted-foreground w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {tierConfig.map((tier, i) => (
                              <tr key={i} className="border-t">
                                <td className="px-3 py-2">
                                  <input
                                    className="w-10 text-center rounded border border-border bg-background px-1 py-0.5 text-sm font-bold"
                                    style={{ color: tier.color }}
                                    value={tier.name}
                                    maxLength={3}
                                    onChange={(e) => {
                                      const next = [...tierConfig]
                                      next[i] = { ...next[i], name: e.target.value.toUpperCase() }
                                      setTierConfig(next)
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    className="w-full rounded border border-border bg-background px-2 py-0.5 text-sm"
                                    value={tier.label}
                                    onChange={(e) => {
                                      const next = [...tierConfig]
                                      next[i] = { ...next[i], label: e.target.value }
                                      setTierConfig(next)
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <input
                                    type="number"
                                    className="w-16 text-center rounded border border-border bg-background px-1 py-0.5 text-sm"
                                    value={tier.minCost}
                                    min={0}
                                    onChange={(e) => {
                                      const next = [...tierConfig]
                                      next[i] = { ...next[i], minCost: parseInt(e.target.value) || 0 }
                                      setTierConfig(next)
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      className="w-6 h-6 rounded border border-border text-sm leading-none hover:bg-muted"
                                      onClick={() => {
                                        if (tier.cost <= 1) return
                                        const next = [...tierConfig]
                                        next[i] = { ...next[i], cost: tier.cost - 1 }
                                        setTierConfig(next)
                                      }}
                                    >−</button>
                                    <span className="w-6 text-center font-mono font-bold">{tier.cost}</span>
                                    <button
                                      type="button"
                                      className="w-6 h-6 rounded border border-border text-sm leading-none hover:bg-muted"
                                      onClick={() => {
                                        const next = [...tierConfig]
                                        next[i] = { ...next[i], cost: tier.cost + 1 }
                                        setTierConfig(next)
                                      }}
                                    >+</button>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {tierConfig.length > 1 && (
                                    <button
                                      type="button"
                                      className="text-muted-foreground hover:text-destructive transition-colors"
                                      onClick={() => setTierConfig(tierConfig.filter((_, j) => j !== i))}
                                    >✕</button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Pokémon are assigned to tiers by their format cost threshold.
                        Each pick deducts that tier&apos;s point cost from your budget — draft any combination as long as you stay within budget.
                      </p>
                    </div>
                  )}
                </div>

                {/* League Settings */}
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-primary" />
                    League Season
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Once the draft completes, your league season begins with a round-robin schedule, standings, and match recording.
                  </p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label
                          htmlFor="leagueWeeks"
                          className="text-sm font-medium"
                        >
                          Season Length (Weeks)
                        </Label>
                        <Select
                          value={formData.leagueWeeks}
                          onValueChange={(value) =>
                            handleInputChange("leagueWeeks", value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select season length" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3">3 weeks</SelectItem>
                            <SelectItem value="4">4 weeks</SelectItem>
                            <SelectItem value="6">6 weeks</SelectItem>
                            <SelectItem value="8">8 weeks</SelectItem>
                            <SelectItem value="10">10 weeks</SelectItem>
                            <SelectItem value="12">12 weeks</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-card rounded-lg border">
                      <input
                        type="checkbox"
                        id="splitIntoConferences"
                        checked={formData.splitIntoConferences}
                        onChange={(e) =>
                          handleInputChange(
                            "splitIntoConferences",
                            e.target.checked,
                          )
                        }
                        disabled={parseInt(formData.maxTeams) < 4}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50"
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor="splitIntoConferences"
                          className="text-sm font-medium cursor-pointer"
                        >
                          Split into 2 conferences
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          {parseInt(formData.maxTeams) < 4
                            ? "Requires at least 4 teams"
                            : "Creates separate Conference A and Conference B with their own standings and schedules"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="p-4 bg-primary/5 rounded-lg border border-primary/10">
                  <h3 className="font-semibold text-foreground mb-3">
                    Draft Summary
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      <Users className="h-3 w-3" />
                      {formData.maxTeams} teams
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1 capitalize"
                    >
                      <Zap className="h-3 w-3" />
                      {formData.draftType} draft
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      <Clock className="h-3 w-3" />
                      {formatTimeLimit(formData.timeLimit)} per pick
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      <Trophy className="h-3 w-3" />
                      {formData.pokemonPerTeam} Pokémon each
                    </Badge>
                    {formData.draftType !== "tiered" && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      <Tag className="h-3 w-3" />
                      {formData.budgetPerTeam} points budget
                    </Badge>
                    )}
                    {formData.draftType === "tiered" && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      <Tag className="h-3 w-3" />
                      S/A/B/C/D/E tier slots
                    </Badge>
                    )}
                  </div>
                </div>
              </CardContent>

              <CardFooter id="tour-create-submit" className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => router.push("/")}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateDraft}
                  disabled={!isFormValid || isCreating}
                  className="flex-1"
                >
                  {isCreating ? "Creating..." : "Create Draft Room"}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
