"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
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
  Zap,
  Trophy,
  Shield,
  Info,
  Eye,
  Tag,
  Download,
  ChevronRight,
  ChevronLeft,
  Check,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Coins,
  Gavel,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { notify } from "@/lib/notifications";
import {
  POKEMON_FORMATS,
  getFormatById,
  getPopularFormats,
  DEFAULT_FORMAT,
} from "@/lib/formats";
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
import {
  USAGE_PRICING_TEMPLATES,
  getTemplatesForFormat,
  templateToCostOverrides,
  getDefaultTierCost,
  type UsagePricingTemplate,
} from '@/lib/usage-pricing-templates'
import { DRAFT_TEMPLATE_PRESETS, type DraftTemplatePreset } from '@/lib/draft-template-presets'
import { DraftTypeComparison } from '@/components/draft/DraftTypeComparison'
import { FormatExplainer } from '@/components/draft/FormatExplainer'

const log = createLogger('CreateDraftPage')

// ─── Step definitions ───────────────────────────────────────────────────
const STEPS = [
  { id: 'type', label: 'Draft Type' },
  { id: 'setup', label: 'Setup' },
  { id: 'rules', label: 'Rules' },
  { id: 'review', label: 'Review' },
] as const

// ─── Draft type cards ───────────────────────────────────────────────────
const DRAFT_TYPES: {
  value: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  badge?: string;
  desc: string;
  example: string;
  bestFor: string;
}[] = [
  {
    value: "tiered",
    icon: Trophy,
    title: "Tiered Draft",
    subtitle: "Most popular",
    badge: "Most popular",
    desc: "Pokemon are split into tiers (S, A, B, C...) based on strength. Each tier costs a set amount of points. You pick one from each tier — or mix and match within your budget.",
    example: "Example: Pick 1 S-tier (20 pts), 2 B-tier (10 pts each), and fill the rest with D/E-tier picks.",
    bestFor: "Best for balanced, competitive leagues where every team feels fair.",
  },
  {
    value: "points",
    icon: Coins,
    title: "Points Draft",
    subtitle: "Classic snake",
    desc: "Every Pokemon has a point cost based on how strong it is. Teams take turns picking in a snake order (1-2-3-4, then 4-3-2-1). Spend your budget wisely across all your picks.",
    example: "Example: With 100 points, you might spend 25 on a star pick and spread the rest across role players.",
    bestFor: "Best for groups who enjoy the strategy of snake-order drafting.",
  },
  {
    value: "auction",
    icon: Gavel,
    title: "Auction Draft",
    subtitle: "Live bidding",
    desc: "Players take turns nominating a Pokemon, then everyone bids in real-time. Highest bidder wins that Pokemon. Budget management is everything.",
    example: "Example: Someone nominates Garchomp — bidding starts at 1 and players bid up. Don't overspend early!",
    bestFor: "Best for experienced groups who want high-energy, interactive drafts.",
  },
]

export default function CreateDraftPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [showTemplates, setShowTemplates] = useState(true);
  const [step, setStep] = useState<number>(0);
  const [isCreating, setIsCreating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formData, setFormData] = useState({
    userName: "",
    teamName: "",
    maxTeams: "4",
    draftType: "",  // empty = must pick
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
    scoringSystem: "budget" as "budget" | "tiered",
  });
  const [tierConfig, setTierConfig] = useState<TierDefinition[]>(DEFAULT_TIER_CONFIG);
  const [customPricing, setCustomPricing] = useState<Record<string, number> | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  useHydrationFix();

  // Pre-fill user data when authenticated
  useEffect(() => {
    if (authLoading || !user) return;
    if (user.user_metadata?.display_name) {
      setFormData((prev) => ({ ...prev, userName: user.user_metadata.display_name }));
    } else if (user.email) {
      setFormData((prev) => ({ ...prev, userName: user.email?.split("@")[0] || "User" }));
    }
  }, [authLoading, user]);

  const applyPresetTemplate = useCallback((preset: DraftTemplatePreset) => {
    setFormData((prev) => ({
      ...prev,
      maxTeams: preset.settings.maxTeams,
      draftType: preset.settings.draftType,
      timeLimit: preset.settings.timeLimit,
      pokemonPerTeam: preset.settings.pokemonPerTeam,
      budgetPerTeam: preset.settings.budgetPerTeam ?? '100',
      formatId: preset.settings.formatId ?? DEFAULT_FORMAT,
      scoringSystem: preset.settings.scoringSystem ?? 'budget',
      createLeague: preset.settings.createLeague ?? true,
      leagueWeeks: preset.settings.leagueWeeks ?? '4',
    }));
    setShowTemplates(false);
    setStep(1); // skip draft type step since template pre-fills it
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleInputChange = useCallback((field: string, value: string | boolean) => {
    setFormData((prev) => {
      if (prev[field as keyof typeof prev] === value) return prev;
      const newData = { ...prev, [field]: value };

      if (field === "draftType") {
        if (value === "tiered") {
          newData.scoringSystem = "tiered"
        } else {
          newData.scoringSystem = "budget"
          if (value !== "auction" && parseInt(prev.pokemonPerTeam) < 6) {
            newData.pokemonPerTeam = "6"
          }
        }
      }
      return newData;
    });
  }, []);

  // Get available usage-based pricing templates for the selected format
  const availableTemplates = getTemplatesForFormat(formData.formatId);
  const allTemplates = USAGE_PRICING_TEMPLATES;

  const applyUsageTemplate = useCallback((template: UsagePricingTemplate) => {
    const overrides = templateToCostOverrides(template);
    const defaultCost = getDefaultTierCost(template);

    // Set custom pricing with the template overrides
    setCustomPricing(overrides);
    setSelectedTemplateId(template.id);
    handleInputChange("useCustomFormat", true);

    // If using tiered draft, also populate the tier config from the template
    if (formData.draftType === "tiered") {
      const tierColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#6366f1', '#94a3b8'];
      const newTierConfig: TierDefinition[] = template.tiers
        .filter(t => t.name !== 'F-Tier' || t.pokemon.length > 0)
        .map((tier, i) => ({
          name: tier.name.replace('-Tier', '').charAt(0),
          label: tier.name,
          cost: tier.cost,
          minCost: tier.cost,
          color: tierColors[i] || '#94a3b8',
        }));
      if (!newTierConfig.some(t => t.cost === defaultCost)) {
        newTierConfig.push({
          name: 'F',
          label: 'F-Tier',
          cost: defaultCost,
          minCost: 0,
          color: '#94a3b8',
        });
      }
      setTierConfig(newTierConfig);
    }

    notify.success("Template Applied", `Loaded ${Object.keys(overrides).length} Pokemon with usage-based pricing`);
  }, [formData.draftType, handleInputChange]);

  const clearUsageTemplate = useCallback(() => {
    setCustomPricing(null);
    setSelectedTemplateId(null);
    handleInputChange("useCustomFormat", false);
    if (formData.draftType === "tiered") {
      setTierConfig(DEFAULT_TIER_CONFIG);
    }
  }, [formData.draftType, handleInputChange]);

  // ─── Format helpers ─────────────────────────────────────────────────
  const selectedFormat = getFormatById(formData.formatId);
  const popularFormats = getPopularFormats();

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "vgc": return "🏆";
      case "smogon": return "⚔️";
      case "custom": return "🎯";
      default: return "📋";
    }
  };

  const getDifficultyColor = (complexity: number) => {
    if (complexity <= 2) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (complexity <= 3) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  };

  const formatTimeLimit = (seconds: string): string => {
    const time = parseInt(seconds);
    if (time === 0) return "No limit";
    if (time < 60) return `${time}s`;
    if (time < 3600) return `${Math.floor(time / 60)}m`;
    return `${Math.floor(time / 3600)}h`;
  };

  const handleExportFormat = async () => {
    if (!selectedFormat) return;
    setIsExporting(true);
    setExportProgress(0);
    try {
      const csvContent = await exportFormatWithProgress(
        formData.formatId,
        (loaded, total) => { setExportProgress(Math.round((loaded / total) * 100)); },
      );
      downloadFormatCSV(formData.formatId, csvContent);
      notify.success("Export Complete", `${selectedFormat.shortName} format exported successfully!`);
    } catch (error) {
      log.error("Export error:", error);
      notify.error("Export Failed", error instanceof Error ? error.message : "Failed to export format");
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
    notify.success("Template Downloaded", "Edit the CSV and upload it to create your custom format");
  };

  // ─── Step validation ────────────────────────────────────────────────
  const canProceed = (stepIndex: number): boolean => {
    switch (stepIndex) {
      case 0: return formData.draftType !== '';
      case 1: return formData.userName.trim() !== '' && formData.teamName.trim() !== '';
      case 2: return !formData.useCustomFormat || !!customPricing;
      case 3: return true;
      default: return false;
    }
  };

  const goNext = () => {
    if (canProceed(step) && step < STEPS.length - 1) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  const goBack = () => {
    if (step > 0) {
      setStep(step - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setShowTemplates(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // ─── Submit ─────────────────────────────────────────────────────────
  const handleCreateDraft = async () => {
    if (!formData.userName.trim() || !formData.teamName.trim()) {
      notify.warning("Missing Information", "Please enter both your name and team name");
      return;
    }
    if (formData.useCustomFormat && !customPricing) {
      notify.warning("Missing Draft Pool", "Please upload a CSV file or paste a Google Sheets link");
      return;
    }
    const pokemonCount = parseInt(formData.pokemonPerTeam);
    if (formData.draftType !== "auction" && pokemonCount < 6) {
      notify.warning("Invalid Pokemon Count", "Points and tiered drafts require at least 6 Pokemon per team");
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
          scoringSystem: formData.draftType === 'tiered' ? 'tiered' : 'budget',
          tierConfig: formData.draftType === 'tiered' ? { tiers: tierConfig } : undefined,
          createLeague: formData.createLeague,
          splitIntoConferences: formData.splitIntoConferences,
          leagueWeeks: parseInt(formData.leagueWeeks),
        },
        isPublic: formData.isPublic,
        description: formData.description || null,
        tags: formData.tags ? formData.tags.split(",").map((t) => t.trim()).filter(Boolean) : null,
        password: !formData.isPublic && formData.password ? formData.password : null,
        customFormat: customPricing
          ? {
              name: `${formData.userName}'s Custom Format`,
              description: formData.description || "Custom Pokemon pricing format",
              pokemonPricing: customPricing,
            }
          : undefined,
      });

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
        error instanceof Error ? error.message : "Failed to create draft room. Please try again.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  // ─── Auth gates ─────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <SidebarLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Checking authentication...</p>
          </div>
        </div>
      </SidebarLayout>
    );
  }

  if (!user) {
    return (
      <SidebarLayout>
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-yellow-500" />
                Sign In to Create a Draft
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You need an account to create and manage draft rooms. Signing in lets you:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
                <li>Host drafts and control the room</li>
                <li>Track your draft history</li>
                <li>Manage league seasons after drafting</li>
              </ul>
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button variant="outline" onClick={() => router.push("/")} className="flex-1">
                Go Back
              </Button>
              <Button onClick={() => router.push("/auth/login")} className="flex-1">
                Sign In
              </Button>
            </CardFooter>
          </Card>
        </div>
      </SidebarLayout>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  STEP RENDERERS
  // ═══════════════════════════════════════════════════════════════════════

  const renderStep0_DraftType = () => (
    <div className="space-y-6">
      {/* Intro for first-time users */}
      <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg">
        <div className="flex items-start gap-3">
          <HelpCircle className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              What is a Pokemon draft?
            </p>
            <p className="text-xs text-blue-800 dark:text-blue-200">
              Each player builds a team by picking Pokemon one at a time. Every Pokemon can only be on one team, so
              you&apos;re competing with others for the best picks. After drafting, you play matches using only the Pokemon you drafted.
            </p>
          </div>
        </div>
      </div>

      {/* Draft type comparison — always visible */}
      <div className="mt-4">
        <DraftTypeComparison />
      </div>

      {/* Draft type selection */}
      <div className="space-y-3">
        <h3 className="font-semibold text-foreground">Choose your draft format</h3>
        <div className="grid gap-3">
          {DRAFT_TYPES.map((opt) => {
            const isSelected = formData.draftType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleInputChange("draftType", opt.value)}
                className={`relative flex flex-col gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? "border-primary ring-2 ring-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-primary/40 hover:bg-muted/50"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-4 w-4 text-primary-foreground" />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isSelected ? "bg-primary/15" : "bg-primary/10"
                  }`}>
                    <opt.icon className={`h-5 w-5 ${isSelected ? "text-primary" : "text-primary/70"}`} />
                  </div>
                  <div>
                    <div className="font-semibold flex items-center gap-1.5">
                      {opt.title}
                      <FormatExplainer formatKey={opt.value === 'points' ? 'points-budget' : opt.value === 'auction' ? 'auction-draft' : 'tiered'} />
                    </div>
                    <div className="flex items-center gap-2">
                      {opt.badge ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {opt.badge}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{opt.subtitle}</span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed">
                  {opt.desc}
                </p>

                <p className="text-xs text-foreground/70 italic">
                  {opt.example}
                </p>

                <p className="text-xs font-medium text-primary">
                  {opt.bestFor}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderStep1_Setup = () => (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Just the basics — who are you and how big is the draft?
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="userName" className="text-sm font-medium">Your Name</Label>
            <Input
              id="userName"
              placeholder="Enter your name"
              value={formData.userName}
              onChange={(e) => handleInputChange("userName", e.target.value)}
              aria-required="true"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="teamName" className="text-sm font-medium">Team Name</Label>
            <Input
              id="teamName"
              placeholder="e.g. Team Rocket"
              value={formData.teamName}
              onChange={(e) => handleInputChange("teamName", e.target.value)}
              aria-required="true"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="maxTeams" className="text-sm font-medium">Number of Teams</Label>
            <Select value={formData.maxTeams} onValueChange={(v) => handleInputChange("maxTeams", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2, 3, 4, 5, 6, 7, 8, 10, 12, 16, 20].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} Teams {n === 4 && "(recommended)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pokemonPerTeam" className="text-sm font-medium">Pokemon per Team</Label>
            <Select value={formData.pokemonPerTeam} onValueChange={(v) => handleInputChange("pokemonPerTeam", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {formData.draftType === "auction" && (
                  <>
                    <SelectItem value="3">3 Pokemon</SelectItem>
                    <SelectItem value="4">4 Pokemon</SelectItem>
                    <SelectItem value="5">5 Pokemon</SelectItem>
                  </>
                )}
                <SelectItem value="6">6 Pokemon {formData.draftType !== "auction" && "(recommended)"}</SelectItem>
                <SelectItem value="9">9 Pokemon</SelectItem>
                <SelectItem value="11">11 Pokemon</SelectItem>
                <SelectItem value="12">12 Pokemon</SelectItem>
                <SelectItem value="15">15 Pokemon</SelectItem>
              </SelectContent>
            </Select>
            {formData.draftType !== "auction" && parseInt(formData.pokemonPerTeam) < 6 && (
              <p className="text-xs text-orange-600 dark:text-orange-400">
                Points and tiered drafts require at least 6 Pokemon per team
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep2_Rules = () => (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Choose which Pokemon are available and how much they cost.
      </p>

      {/* Format/Ruleset */}
      <div className="space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
          <Shield className="h-4 w-4 text-primary" />
          Pokemon Format
        </h3>

        <Select value={formData.formatId} onValueChange={(v) => { handleInputChange("formatId", v); handleInputChange("useCustomFormat", false); setCustomPricing(null); }}>
          <SelectTrigger><SelectValue placeholder="Select format" /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Popular</SelectLabel>
              {popularFormats.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {getCategoryIcon(f.category)} {f.shortName}
                  {f.meta.isOfficial && " ⭐"}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>All Formats</SelectLabel>
              {POKEMON_FORMATS.filter((f) => !popularFormats.some((p) => p.id === f.id)).map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {getCategoryIcon(f.category)} {f.shortName}
                  {f.meta.isOfficial && " ⭐"}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {/* Format info — compact */}
        {selectedFormat && !customPricing && (
          <div className="p-3 bg-muted/50 rounded-lg text-sm">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-medium flex items-center gap-1.5">
                {selectedFormat.name}
                {selectedFormat.id.includes('reg-h') && <FormatExplainer formatKey="regulation-h" />}
              </span>
              <Badge className={`text-xs ${getDifficultyColor(selectedFormat.meta.complexity)}`}>
                {selectedFormat.meta.complexity <= 2 ? "Simple" : selectedFormat.meta.complexity <= 3 ? "Medium" : "Complex"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{selectedFormat.description}</p>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="px-2 py-0.5 bg-background rounded border">Cost {selectedFormat.costConfig.minCost}–{selectedFormat.costConfig.maxCost}</span>
              {selectedFormat.ruleset.legendaryPolicy === "banned" && (
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded">No Legendaries</span>
              )}
              {selectedFormat.ruleset.mythicalPolicy === "banned" && (
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded">No Mythicals</span>
              )}
              {selectedFormat.ruleset.paradoxPolicy === "banned" && (
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded">No Paradox</span>
              )}
            </div>
          </div>
        )}

        {/* Usage-based pricing templates */}
        {!customPricing && (availableTemplates.length > 0 || allTemplates.length > 0) && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-primary" />
              Quick Start Pricing
            </h4>
            <p className="text-xs text-muted-foreground">
              Use a community pricing template based on competitive usage rates. Higher usage = higher cost.
            </p>
            <div className="grid gap-2">
              {(availableTemplates.length > 0 ? availableTemplates : allTemplates).map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyUsageTemplate(template)}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-muted/50 transition-all text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-primary/15">
                    <Trophy className="h-4 w-4 text-primary/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{template.name}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {template.lastUpdated}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {template.tiers.filter(t => t.pokemon.length > 0).map((tier) => (
                        <span
                          key={tier.name}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                        >
                          {tier.name}: {tier.cost}pts ({tier.pokemon.length})
                        </span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 group-hover:text-primary transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Show applied template info */}
        {customPricing && selectedTemplateId && (
          <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg">
            <div className="flex items-center justify-between">
              <p className="text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
                <Check className="h-4 w-4" />
                Usage template applied ({Object.keys(customPricing).length} Pokemon priced)
              </p>
              <button
                type="button"
                onClick={clearUsageTemplate}
                className="text-xs text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 underline"
              >
                Remove
              </button>
            </div>
            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
              Unlisted Pokemon default to {getDefaultTierCost(USAGE_PRICING_TEMPLATES.find(t => t.id === selectedTemplateId)!)} pts
            </p>
          </div>
        )}

        {/* Custom format upload — collapsed by default */}
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            Or upload a custom format (CSV / Google Sheets)
          </summary>
          <div className="mt-3">
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
          </div>
        </details>

        {customPricing && !selectedTemplateId && (
          <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg">
            <p className="text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
              <Check className="h-4 w-4" />
              Custom format loaded ({Object.keys(customPricing).length} Pokemon)
            </p>
          </div>
        )}
      </div>

      {/* Budget & Timer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="budgetPerTeam" className="text-sm font-medium">
            Budget per Team
            <span className="text-xs text-muted-foreground ml-1">
              {formData.draftType === "tiered" ? "(tier points)" : "(draft points)"}
            </span>
          </Label>
          <Select value={formData.budgetPerTeam} onValueChange={(v) => handleInputChange("budgetPerTeam", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50 points</SelectItem>
              <SelectItem value="75">75 points</SelectItem>
              <SelectItem value="100">100 points (default)</SelectItem>
              <SelectItem value="120">120 points</SelectItem>
              <SelectItem value="150">150 points</SelectItem>
              <SelectItem value="200">200 points</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="timeLimit" className="text-sm font-medium">Pick Time Limit</Label>
          <Select value={formData.timeLimit} onValueChange={(v) => handleInputChange("timeLimit", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">No limit (default)</SelectItem>
              <SelectItem value="60">1 minute</SelectItem>
              <SelectItem value="120">2 minutes</SelectItem>
              <SelectItem value="300">5 minutes</SelectItem>
              <SelectItem value="600">10 minutes</SelectItem>
              <SelectItem value="3600">1 hour</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Export format — subtle link */}
      {selectedFormat && !customPricing && (
        <button
          type="button"
          onClick={handleExportFormat}
          disabled={isExporting}
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          <Download className="h-3 w-3" />
          {isExporting ? `Exporting... ${exportProgress}%` : "Export this format's Pokemon list as CSV"}
        </button>
      )}

      {/* Tier config (only for tiered drafts) */}
      {formData.draftType === "tiered" && (
        <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 text-primary" />
              Tier Configuration
            </h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => setTierConfig(DEFAULT_TIER_CONFIG)} className="text-xs text-muted-foreground hover:text-foreground underline">
                Reset
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
                    Format Cost &ge;
                    <span className="block text-[10px] font-normal">(classifies pokemon)</span>
                  </th>
                  <th className="text-center px-3 py-2 font-medium text-xs text-muted-foreground w-28">
                    Pick Cost
                    <span className="block text-[10px] font-normal">(from budget)</span>
                  </th>
                  <th className="w-8" />
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
                          const next = [...tierConfig]; next[i] = { ...next[i], name: e.target.value.toUpperCase() }; setTierConfig(next);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full rounded border border-border bg-background px-2 py-0.5 text-sm"
                        value={tier.label}
                        onChange={(e) => {
                          const next = [...tierConfig]; next[i] = { ...next[i], label: e.target.value }; setTierConfig(next);
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
                          const next = [...tierConfig]; next[i] = { ...next[i], minCost: parseInt(e.target.value) || 0 }; setTierConfig(next);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" className="w-6 h-6 rounded border border-border text-sm leading-none hover:bg-muted"
                          onClick={() => { if (tier.cost <= 1) return; const next = [...tierConfig]; next[i] = { ...next[i], cost: tier.cost - 1 }; setTierConfig(next); }}
                        >&minus;</button>
                        <span className="w-6 text-center font-mono font-bold">{tier.cost}</span>
                        <button type="button" className="w-6 h-6 rounded border border-border text-sm leading-none hover:bg-muted"
                          onClick={() => { const next = [...tierConfig]; next[i] = { ...next[i], cost: tier.cost + 1 }; setTierConfig(next); }}
                        >+</button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {tierConfig.length > 1 && (
                        <button type="button" className="text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() => setTierConfig(tierConfig.filter((_, j) => j !== i))}
                        >&times;</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Pokemon are assigned tiers by their format cost. Each pick deducts that tier&apos;s point cost from your budget.
          </p>
        </div>
      )}
    </div>
  );

  const renderStep3_Review = () => {
    const draftTypeInfo = DRAFT_TYPES.find(d => d.value === formData.draftType);

    return (
      <div className="space-y-6">
        {/* Summary card */}
        <div className="p-5 bg-primary/5 rounded-xl border border-primary/10 space-y-4">
          <h3 className="font-semibold text-lg text-foreground">Draft Summary</h3>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Host</div>
              <div className="font-medium">{formData.userName}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Team</div>
              <div className="font-medium">{formData.teamName}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Draft Type</div>
              <div className="font-medium flex items-center gap-1.5">
                {draftTypeInfo?.icon && <draftTypeInfo.icon className="h-4 w-4 text-primary" />}
                {draftTypeInfo?.title}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Teams</div>
              <div className="font-medium">{formData.maxTeams} teams</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Pokemon per Team</div>
              <div className="font-medium">{formData.pokemonPerTeam}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Budget</div>
              <div className="font-medium">{formData.budgetPerTeam} points</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Pick Timer</div>
              <div className="font-medium">{formatTimeLimit(formData.timeLimit)}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Format</div>
              <div className="font-medium">
                {customPricing && selectedTemplateId
                  ? USAGE_PRICING_TEMPLATES.find(t => t.id === selectedTemplateId)?.name || "Usage Template"
                  : customPricing
                    ? "Custom (CSV)"
                    : selectedFormat?.shortName || formData.formatId}
              </div>
            </div>
          </div>

          {formData.draftType === "tiered" && (
            <div className="pt-3 border-t border-primary/10">
              <div className="text-xs text-muted-foreground mb-2">Tiers</div>
              <div className="flex flex-wrap gap-2">
                {tierConfig.map((tier) => (
                  <Badge key={tier.name} variant="secondary" style={{ borderLeftColor: tier.color, borderLeftWidth: 3 }}>
                    {tier.name} &mdash; {tier.cost} pts
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                What happens next?
              </p>
              <ol className="text-xs text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
                <li>A private room is created with a 6-letter code</li>
                <li>Share the code with your friends so they can join</li>
                <li>Once everyone has joined, you (the host) start the draft</li>
                <li>
                  {formData.draftType === "auction"
                    ? "Players nominate and bid on Pokemon in real-time"
                    : "Teams take turns picking Pokemon in snake order"}
                </li>
                <li>After all picks are made, your league season begins automatically</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Advanced settings (collapsed) */}
        <div className="rounded-lg border">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between p-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Advanced Settings</span>
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showAdvanced && (
            <div className="px-4 pb-4 space-y-5 border-t pt-4">
              {/* Spectator / Privacy */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  Visibility
                </h4>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={formData.isPublic}
                    onChange={(e) => handleInputChange("isPublic", e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <div>
                    <Label htmlFor="isPublic" className="text-sm font-medium cursor-pointer">
                      Public draft
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Anyone can watch as a spectator (they can&apos;t pick).
                    </p>
                  </div>
                </div>

                {!formData.isPublic && (
                  <div className="space-y-2 ml-7">
                    <Label htmlFor="password" className="text-sm font-medium">Password (optional)</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Protect your draft with a password"
                      value={formData.password}
                      onChange={(e) => handleInputChange("password", e.target.value)}
                    />
                  </div>
                )}

                {formData.isPublic && (
                  <div className="space-y-3 ml-7">
                    <div className="space-y-2">
                      <Label htmlFor="description" className="text-sm font-medium">Description (optional)</Label>
                      <textarea
                        id="description"
                        placeholder="e.g. 'High-level VGC tournament draft'"
                        value={formData.description}
                        onChange={(e) => handleInputChange("description", e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tags" className="text-sm font-medium flex items-center gap-1">
                        <Tag className="h-3 w-3" /> Tags (optional)
                      </Label>
                      <Input
                        id="tags"
                        placeholder="tournament, competitive, casual (comma-separated)"
                        value={formData.tags}
                        onChange={(e) => handleInputChange("tags", e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* League settings */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                  League Season
                </h4>
                <p className="text-xs text-muted-foreground">
                  After drafting, a round-robin league is created automatically with standings and match recording.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="leagueWeeks" className="text-sm font-medium">Season Length</Label>
                    <Select value={formData.leagueWeeks} onValueChange={(v) => handleInputChange("leagueWeeks", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 weeks</SelectItem>
                        <SelectItem value="4">4 weeks (default)</SelectItem>
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
                    onChange={(e) => handleInputChange("splitIntoConferences", e.target.checked)}
                    disabled={parseInt(formData.maxTeams) < 4}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50"
                  />
                  <div>
                    <Label htmlFor="splitIntoConferences" className="text-sm font-medium cursor-pointer">
                      Split into 2 conferences
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {parseInt(formData.maxTeams) < 4
                        ? "Requires at least 4 teams"
                        : "Separate standings and schedules for Conference A and B"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════
  //  MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <SidebarLayout>
      <div className="min-h-screen bg-background transition-colors duration-500">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-1">
              Create Draft Room
            </h1>
            <p className="text-sm text-muted-foreground">
              Set up a Pokemon draft in a few quick steps.
            </p>
          </div>

          {/* Template Selection */}
          {showTemplates && (
            <div className="space-y-6 mb-8">
              <div>
                <h2 className="font-semibold text-foreground mb-1">Quick Start</h2>
                <p className="text-xs text-muted-foreground">
                  Pick a template to pre-fill your settings, or build a custom draft from scratch.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DRAFT_TEMPLATE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPresetTemplate(preset)}
                    className="relative flex flex-col gap-2 p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/50 hover:shadow-md transition-all text-left group"
                  >
                    {preset.recommended && (
                      <Badge variant="default" className="absolute -top-2.5 right-3 text-[10px] px-2 py-0.5">
                        Recommended
                      </Badge>
                    )}
                    <div className="flex items-center gap-3">
                      <span className="text-2xl" role="img" aria-hidden="true">{preset.icon}</span>
                      <div>
                        <div className="font-semibold text-sm">{preset.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {preset.settings.maxTeams} teams
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {preset.settings.draftType}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {preset.settings.pokemonPerTeam} pokemon
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {preset.description}
                    </p>
                    <ChevronRight className="absolute top-1/2 -translate-y-1/2 right-3 h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-3 text-xs text-muted-foreground">or</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => { setShowTemplates(false); setStep(0); }}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-border bg-card hover:border-primary/40 hover:bg-muted/50 transition-all text-sm text-muted-foreground hover:text-foreground"
              >
                <Zap className="h-4 w-4" />
                Custom Draft — full control over every setting
              </button>
            </div>
          )}

          {/* Step indicator */}
          {!showTemplates && (<>
          <div className="flex items-center gap-2 mb-6">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    // Allow clicking back to completed steps
                    if (i < step) setStep(i);
                  }}
                  disabled={i > step}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                    i === step
                      ? "text-primary"
                      : i < step
                        ? "text-foreground cursor-pointer hover:text-primary"
                        : "text-muted-foreground/50"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    i === step
                      ? "border-primary bg-primary text-primary-foreground"
                      : i < step
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-muted-foreground/30 text-muted-foreground/50"
                  }`}>
                    {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 rounded ${i < step ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              {step === 0 && renderStep0_DraftType()}
              {step === 1 && renderStep1_Setup()}
              {step === 2 && renderStep2_Rules()}
              {step === 3 && renderStep3_Review()}
            </CardContent>

            <CardFooter className="flex gap-3 pt-4">
              {step > 0 ? (
                <Button variant="outline" onClick={goBack} className="flex-1">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              ) : (
                <Button variant="outline" onClick={() => router.push("/")} className="flex-1">
                  Cancel
                </Button>
              )}

              {step < STEPS.length - 1 ? (
                <Button onClick={goNext} disabled={!canProceed(step)} className="flex-1">
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleCreateDraft}
                  disabled={!formData.userName.trim() || !formData.teamName.trim() || isCreating}
                  className="flex-1"
                >
                  {isCreating ? "Creating..." : "Create Draft Room"}
                </Button>
              )}
            </CardFooter>
          </Card>
          </>)}
        </div>
      </div>
    </SidebarLayout>
  );
}
