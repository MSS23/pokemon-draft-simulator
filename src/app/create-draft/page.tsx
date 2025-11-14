"use client";

import { useState, useEffect, useRef } from "react";
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
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useNotify } from "@/components/providers/NotificationProvider";
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
import { supabase } from "@/lib/supabase";
import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { useAuth } from "@/contexts/AuthContext";

export default function CreateDraftPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const notify = useNotify();
  const [formData, setFormData] = useState({
    userName: "",
    teamName: "",
    maxTeams: "4",
    draftType: "snake",
    timeLimit: "0",
    pokemonPerTeam: "6",
    budgetPerTeam: "100",
    formatId: DEFAULT_FORMAT,
    isPublic: false,
    description: "",
    tags: "",
    password: "",
    useCustomFormat: false,
    createLeague: true,
    splitIntoConferences: false,
    leagueWeeks: "4",
  });

  const [customPricing, setCustomPricing] = useState<Record<
    string,
    number
  > | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Apply hydration fix for browser extensions
  useHydrationFix();

  // Track if notification was shown to prevent spam
  const hasShownAuthNotification = useRef(false);

  // Check authentication and pre-fill user data
  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return;

    // Redirect if not authenticated
    if (!user) {
      // Only show notification once
      if (!hasShownAuthNotification.current) {
        notify.warning(
          "Authentication Required",
          "Please sign in to create a draft",
        );
        hasShownAuthNotification.current = true;
      }
      router.push("/");
      return;
    }

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
  }, [authLoading, user, router, notify]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => {
      const newData = { ...prev, [field]: value };

      // If switching to snake draft, enforce league creation and minimum 6 Pokemon
      if (field === "draftType" && value === "snake") {
        // Force league creation for snake drafts
        newData.createLeague = true;

        // Ensure minimum 6 Pokemon per team
        if (parseInt(prev.pokemonPerTeam) < 6) {
          newData.pokemonPerTeam = "6";
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
      console.error("Export error:", error);
      notify.error(
        "Export Failed",
        error instanceof Error ? error.message : "Failed to export format",
      );
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const handleDownloadTemplate = () => {
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
        "Missing Custom Pricing",
        "Please upload a CSV file with custom Pokemon pricing",
      );
      return;
    }

    // Enforce minimum Pokemon limit for snake drafts
    const pokemonCount = parseInt(formData.pokemonPerTeam);
    if (formData.draftType === "snake" && pokemonCount < 6) {
      notify.warning(
        "Invalid Pokemon Count",
        "Snake drafts require at least 6 Pokémon per team for points-based gameplay",
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
          draftType: formData.draftType as "snake" | "auction",
          timeLimit: parseInt(formData.timeLimit),
          pokemonPerTeam: parseInt(formData.pokemonPerTeam),
          budgetPerTeam: parseInt(formData.budgetPerTeam),
          formatId: formData.useCustomFormat ? "custom" : formData.formatId,
          // League settings (stored in draft settings for league creation later)
          createLeague: formData.createLeague,
          splitIntoConferences: formData.splitIntoConferences,
          leagueWeeks: parseInt(formData.leagueWeeks),
        } as any,
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
          formData.useCustomFormat && customPricing
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
      console.error("Failed to create draft:", error);
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

  return (
    <SidebarLayout>
      <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="relative text-center mb-8">
            <div className="absolute top-0 right-0">
              <ThemeToggle />
            </div>
            {user?.email && (
              <div className="absolute top-0 left-0 text-sm text-muted-foreground">
                Signed in as: {user.email}
              </div>
            )}
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 dark:from-blue-400 dark:via-blue-300 dark:to-cyan-400 bg-clip-text text-transparent mb-4">
              Create Draft Room
            </h1>
            <p className="text-lg text-muted-foreground mb-6">
              Set up a multiplayer Pokémon draft for your team
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            <Card className="shadow-xl">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Draft Configuration</CardTitle>
                <CardDescription>
                  Configure your draft settings and create a room for teams to
                  join
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* User Identity */}
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
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
                      />
                    </div>
                  </div>
                </div>

                {/* Draft Settings */}
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
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
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2 Teams</SelectItem>
                          <SelectItem value="4">4 Teams</SelectItem>
                          <SelectItem value="6">6 Teams</SelectItem>
                          <SelectItem value="8">8 Teams</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="draftType"
                        className="text-sm font-medium"
                      >
                        Draft Format
                      </Label>
                      <Select
                        value={formData.draftType}
                        onValueChange={(value) =>
                          handleInputChange("draftType", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="snake">Snake Draft</SelectItem>
                          <SelectItem value="auction">Auction Draft</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Format/Ruleset Selection */}
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Pokemon Format & Rules
                  </h3>

                  <div className="space-y-3">
                    {/* Toggle for custom format */}
                    <div className="flex items-start gap-3 p-3 bg-card rounded-lg border">
                      <input
                        type="checkbox"
                        id="useCustomFormat"
                        checked={formData.useCustomFormat}
                        onChange={(e) =>
                          handleInputChange("useCustomFormat", e.target.checked)
                        }
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor="useCustomFormat"
                          className="text-sm font-medium cursor-pointer"
                        >
                          Use Custom Pricing (CSV)
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Upload your own Pokemon pricing instead of using a
                          preset format
                        </p>
                      </div>
                    </div>

                    {/* Show CSV upload if custom format is selected */}
                    {formData.useCustomFormat ? (
                      <CSVUpload
                        onPricingParsed={(pricing) => {
                          setCustomPricing(pricing);
                        }}
                        onClear={() => {
                          setCustomPricing(null);
                        }}
                      />
                    ) : (
                      <>
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
                              <SelectValue />
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
                    {selectedFormat && !formData.useCustomFormat && (
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
                            Download this format's Pokemon list with draft
                            points. Edit it to create your own custom format!
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Custom Format Template Download */}
                    {formData.useCustomFormat && (
                      <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <div className="flex items-start gap-2 mb-2">
                          <Info className="h-4 w-4 text-primary mt-0.5" />
                          <div className="flex-1">
                            <h4 className="text-sm font-medium text-foreground">
                              Need a template?
                            </h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              Download a template CSV file with example Pokemon
                              to get started
                            </p>
                          </div>
                        </div>
                        <Button
                          onClick={handleDownloadTemplate}
                          variant="outline"
                          size="sm"
                          className="w-full border-primary/30 text-primary hover:bg-primary/10"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download Custom Format Template
                        </Button>
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
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
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
                          <SelectItem value="0">No limit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="pokemonPerTeam"
                        className="text-sm font-medium"
                      >
                        Pokémon per Team{" "}
                        {formData.draftType === "snake" && (
                          <span className="text-xs text-slate-500">
                            (min 6 for points-based)
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
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {formData.draftType === "auction" && (
                            <SelectItem value="3">3 Pokémon</SelectItem>
                          )}
                          <SelectItem value="6">6 Pokémon</SelectItem>
                          <SelectItem value="9">9 Pokémon</SelectItem>
                          <SelectItem value="11">11 Pokémon</SelectItem>
                          <SelectItem value="12">12 Pokémon</SelectItem>
                          <SelectItem value="15">15 Pokémon</SelectItem>
                        </SelectContent>
                      </Select>
                      {formData.draftType === "snake" &&
                        parseInt(formData.pokemonPerTeam) < 6 && (
                          <p className="text-xs text-orange-600 dark:text-orange-400">
                            ⚠️ Snake drafts are typically points-based and
                            require at least 6 Pokémon
                          </p>
                        )}
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="budgetPerTeam"
                        className="text-sm font-medium"
                      >
                        Budget per Team (Points){" "}
                        <span className="text-xs text-slate-500">
                          Used to draft Pokémon
                        </span>
                      </Label>
                      <Select
                        value={formData.budgetPerTeam}
                        onValueChange={(value) =>
                          handleInputChange("budgetPerTeam", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="50">50 points</SelectItem>
                          <SelectItem value="75">75 points</SelectItem>
                          <SelectItem value="100">
                            100 points (Default)
                          </SelectItem>
                          <SelectItem value="120">120 points</SelectItem>
                          <SelectItem value="150">150 points</SelectItem>
                          <SelectItem value="200">200 points</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Each Pokémon has a cost based on its strength. Budget
                        determines what you can draft.
                      </p>
                    </div>
                  </div>
                </div>

                {/* League Settings */}
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-primary" />
                    Post-Draft League
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="createLeague"
                        checked={formData.createLeague}
                        onChange={(e) =>
                          handleInputChange("createLeague", e.target.checked)
                        }
                        disabled={formData.draftType === "snake"}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor="createLeague"
                          className="text-sm font-medium cursor-pointer"
                        >
                          Create league after draft
                          {formData.draftType === "snake" && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              Required for Snake
                            </Badge>
                          )}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formData.draftType === "snake"
                            ? "Snake drafts automatically create a league with 1 match per team per week"
                            : "Automatically generate a competitive league schedule with standings when the draft completes"}
                        </p>
                      </div>
                    </div>

                    {formData.createLeague && (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label
                              htmlFor="leagueWeeks"
                              className="text-sm font-medium"
                            >
                              League Duration (Weeks)
                            </Label>
                            <Select
                              value={formData.leagueWeeks}
                              onValueChange={(value) =>
                                handleInputChange("leagueWeeks", value)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
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
                      </>
                    )}
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
                      className="flex items-center gap-1"
                    >
                      <Zap className="h-3 w-3" />
                      {formData.draftType === "snake"
                        ? "Snake"
                        : "Auction"}{" "}
                      format
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
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      <Tag className="h-3 w-3" />
                      {formData.budgetPerTeam} points budget
                    </Badge>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex gap-3">
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
