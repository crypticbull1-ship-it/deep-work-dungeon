import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

type HeroClass = 'Mage' | 'Knight' | 'Ranger' | 'Rogue';
type Screen =
  | 'concept'
  | 'heroName'
  | 'avatar'
  | 'quartermaster'
  | 'camp'
  | 'questBoard'
  | 'dungeonRun'
  | 'roomResult'
  | 'questLog'
  | 'armory';
type Difficulty = 'Easy' | 'Normal' | 'Boss';
type Outcome = 'Victory' | 'Partial' | 'Failed' | 'Abandoned';
type UpgradeId = 'sharperFocus' | 'goldFinder' | 'streakShield' | 'bossHunter';
type ReviewMilestone = 'firstFloorCleared' | 'firstBossVictory' | 'firstThreeDayStreak';

type UserState = {
  onboardingComplete: boolean;
  heroName: string | null;
  avatarEmoji: string | null;
  heroClass: HeroClass | null;
  level: number;
  xp: number;
  gold: number;
  currentStreak: number;
  bestStreak: number;
  lastVictoryDate: string | null;
  currentFloor: number;
  roomsClearedOnFloor: number;
  heroHp: number;
  classVictoryCount: number;
  lastReviewPromptDate: string | null;
  reviewPromptCount: number;
  reviewMilestonesPrompted: Record<ReviewMilestone, boolean>;
  upgrades: {
    sharperFocus: number;
    goldFinder: number;
    streakShield: number;
    bossHunter: number;
  };
};

type ActiveQuest = {
  title: string;
  winCondition: string;
  durationMinutes: number;
  durationSeconds: number;
  difficulty: Difficulty;
  startedAt: string;
};

type SessionRecord = {
  id: string;
  questTitle: string;
  winCondition: string;
  durationMinutes: number;
  difficulty: Difficulty;
  startedAt: string;
  endedAt: string;
  outcome: Outcome;
  xpGained: number;
  goldGained: number;
  roomCleared: boolean;
};

type ResultDetails = {
  outcome: Outcome;
  xpGained: number;
  goldGained: number;
  roomCleared: boolean;
  levelBefore: number;
  levelAfter: number;
  streakBefore: number;
  streakAfter: number;
  floorBefore: number;
  floorAfter: number;
  roomsBefore: number;
  roomsAfter: number;
  hpBefore: number;
  hpAfter: number;
  classBonusLines: string[];
};

type UpgradeDefinition = {
  id: UpgradeId;
  name: string;
  cost: number;
  effect: string;
  maxPurchase: number | null;
};

type StreakCheckResult = {
  nextState: UserState;
  notice: string;
};

type ClassDefinition = {
  emoji: string;
  heroClass: HeroClass;
  abilityName: string;
  abilityText: string;
};

type QuestTemplate = {
  name: string;
  questTitle: string;
  winCondition: string;
};

const USER_STORAGE_KEY = 'deepWorkDungeon:userState';
const SESSION_STORAGE_KEY = 'deepWorkDungeon:sessions';
const roomsPerFloor = 5;
const reviewCooldownDays = 45;
const maxReviewPrompts = 3;
const dungeonRoomBackground = require('./assets/art/dungeon-run/dungeon_room_bg.png');
const heroKnightSprite = require('./assets/art/dungeon-run/hero_knight.png');
const roomWardenSprite = require('./assets/art/dungeon-run/enemy_room_warden.png');
const questPlaqueFrame = require('./assets/art/dungeon-run/ui_quest_plaque.png');
const timerPlaqueFrame = require('./assets/art/dungeon-run/ui_timer_plaque.png');
const hpFrame = require('./assets/art/dungeon-run/ui_hp_frame.png');
const focusFrame = require('./assets/art/dungeon-run/ui_focus_frame.png');
const abandonFrame = require('./assets/art/dungeon-run/ui_abandon_frame.png');

// Dungeon Run tuning guide:
// centerXPct controls horizontal placement, heightPct controls rendered sprite size,
// baselinePct/sharedFloorBaselinePx controls floor alignment, textOffsetYPx controls
// optical text centering, and visualOffsetXPct compensates for transparent PNG padding.
const DUNGEON_RUN_LAYOUT = {
  stage: {
    minHeightPx: 700,
    safeSidePct: 0.07,
    contentWidthPct: '86%',
    shadePaddingTopPx: 12,
    shadeBottomBreathingRoomPx: 18,
  },
  topStack: {
    gapPx: 4,
  },
  bottomStack: {
    gapPx: 7,
  },
  battleStage: {
    minHeightPx: 245,
  },
  questPlaque: {
    aspectRatio: 814 / 277,
    widthPct: '84%',
    position: 'topStack',
    textInset: { left: '11%', right: '11%', top: '31%', bottom: '15%' },
    textOffsetYPx: 0,
  },
  timerPlaque: {
    aspectRatio: 668 / 282,
    widthPct: '66%',
    position: 'belowQuestPlaque',
    textInset: { left: '12%', right: '12%', top: '13%', bottom: '12%' },
    labelOffsetYPx: 0,
    valueOffsetYPx: 0,
    subtitleOffsetYPx: 0,
  },
  wardenName: {
    topPx: 38,
    rightPct: '8%',
    widthPct: '54%',
    textOffsetYPx: 0,
  },
  hpFrame: {
    aspectRatio: 799 / 112,
    widthPct: '100%',
    headerInset: { left: '12%', right: '11%', top: '36%' },
    fillInset: { left: '11%', right: '10%', bottom: '18%', height: '16%' },
    valueTextPosition: 'headerRight',
  },
  sprites: {
    sharedFloorBaselinePx: 0,
    sharedFloorBaselinePct: 0,
  },
  focusMeter: {
    aspectRatio: 791 / 235,
    widthPct: '76%',
    position: 'bottomStack',
    headerInset: { left: '11%', right: '11%', top: '31%' },
    fillInset: { left: '10%', right: '10%', bottom: '24%', height: '15%' },
  },
  abandonButton: {
    aspectRatio: 671 / 288,
    widthPct: '68%',
    position: 'bottomStack',
    textInset: { left: '18%', right: '18%', top: '39%', bottom: '28%' },
    textOffsetYPx: 0,
  },
} as const;

const HERO_SPRITE_LAYOUTS = {
  Knight: {
    image: heroKnightSprite,
    aspectRatio: 874 / 1022,
    heightPctMin: 0.175,
    heightPctMax: 0.192,
    minHeightPx: 126,
    centerXPct: 0.285,
    baselineOffsetPx: 0,
    visualOffsetXPct: 0,
    notes: 'Tune centerXPct to move the knight horizontally; tune heightPctMin/Max to resize.',
  },
} as const;

const ENEMY_SPRITE_LAYOUTS = {
  RoomWarden: {
    image: roomWardenSprite,
    aspectRatio: 1076 / 1258,
    heightPctMin: 0.242,
    heightPctMax: 0.267,
    minHeightPx: 174,
    centerXPct: 0.715,
    baselineOffsetPx: 0,
    visualOffsetXPct: 0,
    notes: 'Tune centerXPct to move the Warden horizontally; keep enough width for the weapon.',
  },
} as const;

const vagueQuestTitles = new Set([
  'work',
  'think',
  'research',
  'study',
  'plan',
  'productivity',
  'toilet',
]);

const difficultySettings: Record<
  Difficulty,
  { durationMinutes: number; durationSeconds: number; xp: number; gold: number }
> = {
  Easy: { durationMinutes: 15, durationSeconds: 15 * 60, xp: 50, gold: 20 },
  Normal: { durationMinutes: 25, durationSeconds: 25 * 60, xp: 100, gold: 40 },
  Boss: { durationMinutes: 45, durationSeconds: 45 * 60, xp: 200, gold: 80 },
};

const outcomeMultipliers: Record<Outcome, { xp: number; gold: number; roomCleared: boolean }> = {
  Victory: { xp: 1, gold: 1, roomCleared: true },
  Partial: { xp: 0.35, gold: 0.25, roomCleared: false },
  Failed: { xp: 0, gold: 0, roomCleared: false },
  Abandoned: { xp: 0, gold: 0, roomCleared: false },
};

const defaultReviewMilestonesPrompted: Record<ReviewMilestone, boolean> = {
  firstFloorCleared: false,
  firstBossVictory: false,
  firstThreeDayStreak: false,
};

const classDefinitions: Record<HeroClass, ClassDefinition> = {
  Mage: {
    emoji: '🧙',
    heroClass: 'Mage',
    abilityName: 'Arcane Focus',
    abilityText: '+10% XP from Victory runs.',
  },
  Knight: {
    emoji: '🛡️',
    heroClass: 'Knight',
    abilityName: 'Iron Will',
    abilityText: 'Failed loses 5 HP. Abandoned loses 10 HP.',
  },
  Ranger: {
    emoji: '🏹',
    heroClass: 'Ranger',
    abilityName: 'Pathfinder',
    abilityText: 'Every 4th Victory clears +1 bonus room.',
  },
  Rogue: {
    emoji: '🔥',
    heroClass: 'Rogue',
    abilityName: 'Salvage Instinct',
    abilityText: 'Partial gives 50% XP and 40% gold.',
  },
};

const questTemplates: QuestTemplate[] = [
  {
    name: 'Writing',
    questTitle: 'Write one rough draft',
    winCondition: 'At least 150 words exist by the end',
  },
  {
    name: 'Studying',
    questTitle: 'Study one section',
    winCondition: 'Read one section and write 3 notes',
  },
  {
    name: 'Coding',
    questTitle: 'Fix one coding task',
    winCondition: 'One bug fixed or one component improved',
  },
  {
    name: 'Outreach',
    questTitle: 'Complete outreach block',
    winCondition: 'Send or prepare 5 real outreach messages',
  },
  {
    name: 'Admin Cleanup',
    questTitle: 'Clear admin task',
    winCondition: 'One inbox, file, or form cleanup completed',
  },
  {
    name: 'Reading',
    questTitle: 'Read and capture notes',
    winCondition: 'Read 10 pages and write 3 notes',
  },
];

const upgradeDefinitions: UpgradeDefinition[] = [
  {
    id: 'sharperFocus',
    name: 'Sharper Focus',
    cost: 100,
    effect: '+10% XP from completed Victory sessions',
    maxPurchase: 1,
  },
  {
    id: 'goldFinder',
    name: 'Gold Finder',
    cost: 120,
    effect: '+10% gold from completed Victory sessions',
    maxPurchase: 1,
  },
  {
    id: 'streakShield',
    name: 'Streak Shield',
    cost: 150,
    effect: 'Protects one missed-day streak break',
    maxPurchase: null,
  },
  {
    id: 'bossHunter',
    name: 'Boss Hunter',
    cost: 200,
    effect: '+25% XP from Boss difficulty Victory sessions',
    maxPurchase: 1,
  },
];

const defaultUserState: UserState = {
  onboardingComplete: false,
  heroName: null,
  avatarEmoji: null,
  heroClass: null,
  level: 1,
  xp: 0,
  gold: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastVictoryDate: null,
  currentFloor: 1,
  roomsClearedOnFloor: 0,
  heroHp: 100,
  classVictoryCount: 0,
  lastReviewPromptDate: null,
  reviewPromptCount: 0,
  reviewMilestonesPrompted: defaultReviewMilestonesPrompted,
  upgrades: {
    sharperFocus: 0,
    goldFinder: 0,
    streakShield: 0,
    bossHunter: 0,
  },
};

const avatarOptions: Array<{ emoji: string; heroClass: HeroClass }> = [
  { emoji: '🧙', heroClass: 'Mage' },
  { emoji: '🛡️', heroClass: 'Knight' },
  { emoji: '🏹', heroClass: 'Ranger' },
  { emoji: '🔥', heroClass: 'Rogue' },
];

const difficultyOptions: Difficulty[] = ['Easy', 'Normal', 'Boss'];
const outcomeStyles: Record<Outcome, 'victoryResult' | 'partialResult' | 'failedResult' | 'abandonedResult'> = {
  Victory: 'victoryResult',
  Partial: 'partialResult',
  Failed: 'failedResult',
  Abandoned: 'abandonedResult',
};

export default function App() {
  return (
    <SafeAreaProvider>
      <DungeonApp />
    </SafeAreaProvider>
  );
}

function DungeonApp() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [userState, setUserState] = useState<UserState>(defaultUserState);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [screen, setScreen] = useState<Screen>('concept');
  const [isLoading, setIsLoading] = useState(true);
  const [heroNameInput, setHeroNameInput] = useState('');
  const [heroNameError, setHeroNameError] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(avatarOptions[1]);
  const [questTitle, setQuestTitle] = useState('');
  const [winCondition, setWinCondition] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('Normal');
  const [questError, setQuestError] = useState('');
  const [activeQuest, setActiveQuest] = useState<ActiveQuest | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [resultDetails, setResultDetails] = useState<ResultDetails | null>(null);
  const [campNotice, setCampNotice] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [pendingReviewMilestone, setPendingReviewMilestone] = useState<ReviewMilestone | null>(null);
  const showBottomGutter = screen === 'armory' || screen === 'questLog';
  const showFixedActionFooter = screen === 'camp' || screen === 'questBoard';
  const bottomGutterHeight = getBottomGutterHeight(insets.bottom);
  const scrollBottomSpacer = getScrollBottomSpacer(screen, insets.bottom);

  useEffect(() => {
    void loadPersistedState();
  }, []);

  useEffect(() => {
    if (screen !== 'dungeonRun' || showAbandonConfirm || secondsRemaining <= 0) {
      return;
    }

    const timerId = setInterval(() => {
      setSecondsRemaining((currentSeconds) => {
        if (currentSeconds <= 1) {
          setScreen('roomResult');
          setSelectedOutcome(null);
          setResultDetails(null);
          return 0;
        }

        return currentSeconds - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [screen, secondsRemaining, showAbandonConfirm]);

  const xpRequired = userState.level * 100;
  const xpPercent = useMemo(
    () => Math.min(100, Math.round((userState.xp / xpRequired) * 100)),
    [userState.xp, xpRequired],
  );
  const totalSeconds = activeQuest ? activeQuest.durationSeconds : 0;
  const elapsedSeconds = Math.max(0, totalSeconds - secondsRemaining);
  const runProgress = totalSeconds > 0 ? elapsedSeconds / totalSeconds : 0;
  const enemyHp = Math.max(0, Math.ceil(100 - runProgress * 100));
  const focusPercent = Math.min(100, Math.round(runProgress * 100));
  const activeClass = classDefinitions[userState.heroClass ?? 'Knight'];
  const heroSpriteLayout = HERO_SPRITE_LAYOUTS.Knight;
  const enemySpriteLayout = ENEMY_SPRITE_LAYOUTS.RoomWarden;
  const dungeonRunHeight = Math.max(
    DUNGEON_RUN_LAYOUT.stage.minHeightPx,
    windowHeight - insets.top,
  );
  const heroSpriteHeight = Math.min(
    dungeonRunHeight * heroSpriteLayout.heightPctMax,
    Math.max(dungeonRunHeight * heroSpriteLayout.heightPctMin, heroSpriteLayout.minHeightPx),
  );
  const enemySpriteHeight = Math.min(
    dungeonRunHeight * enemySpriteLayout.heightPctMax,
    Math.max(dungeonRunHeight * enemySpriteLayout.heightPctMin, enemySpriteLayout.minHeightPx),
  );
  const heroSpriteWidth = heroSpriteHeight * heroSpriteLayout.aspectRatio;
  const enemySpriteWidth = enemySpriteHeight * enemySpriteLayout.aspectRatio;
  const dungeonSafeSide = windowWidth * DUNGEON_RUN_LAYOUT.stage.safeSidePct;
  const heroSpriteLeft = Math.max(
    dungeonSafeSide,
    windowWidth * (heroSpriteLayout.centerXPct + heroSpriteLayout.visualOffsetXPct) -
      heroSpriteWidth / 2,
  );
  const enemySpriteLeft = Math.min(
    windowWidth - dungeonSafeSide - enemySpriteWidth,
    windowWidth * (enemySpriteLayout.centerXPct + enemySpriteLayout.visualOffsetXPct) -
      enemySpriteWidth / 2,
  );
  const spriteFloorBaselinePx = DUNGEON_RUN_LAYOUT.sprites.sharedFloorBaselinePx;

  async function loadPersistedState() {
    try {
      const [storedUserValue, storedSessionsValue] = await Promise.all([
        AsyncStorage.getItem(USER_STORAGE_KEY),
        AsyncStorage.getItem(SESSION_STORAGE_KEY),
      ]);

      if (storedUserValue) {
        const hydratedState = parseStoredUserState(storedUserValue);
        const streakCheck = checkMissedDayStreak(hydratedState, new Date());
        const nextState = streakCheck.nextState;
        setUserState(nextState);
        setHeroNameInput(nextState.heroName ?? '');
        setCampNotice(streakCheck.notice);
        if (nextState.avatarEmoji && nextState.heroClass) {
          setSelectedAvatar({
            emoji: nextState.avatarEmoji,
            heroClass: nextState.heroClass,
          });
        }
        if (streakCheck.notice) {
          void AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextState));
        }
        setScreen(nextState.onboardingComplete ? 'camp' : 'concept');
      }

      if (storedSessionsValue) {
        setSessions(parseStoredSessions(storedSessionsValue));
      }
    } catch {
      setUserState(defaultUserState);
      setSessions([]);
      setCampNotice('Saved data could not be loaded. The app recovered to a fresh state.');
      setScreen('concept');
    } finally {
      setIsLoading(false);
    }
  }

  async function persistUserState(nextState: UserState) {
    setUserState(nextState);
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextState));
  }

  async function persistSessions(nextSessions: SessionRecord[]) {
    setSessions(nextSessions);
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSessions));
  }

  function dismissCampNotice() {
    setCampNotice('');
  }

  async function resetAppData() {
    await AsyncStorage.multiRemove([USER_STORAGE_KEY, SESSION_STORAGE_KEY]);
    setUserState(defaultUserState);
    setSessions([]);
    setScreen('concept');
    setHeroNameInput('');
    setHeroNameError('');
    setSelectedAvatar(avatarOptions[1]);
    setQuestTitle('');
    setWinCondition('');
    setDifficulty('Normal');
    setQuestError('');
    setActiveQuest(null);
    setSecondsRemaining(0);
    setShowAbandonConfirm(false);
    setSelectedOutcome(null);
    setResultDetails(null);
    setCampNotice('');
    setShowResetConfirm(false);
    setPendingReviewMilestone(null);
  }

  function continueFromHeroName() {
    const trimmedName = heroNameInput.trim();

    if (trimmedName.length < 2) {
      setHeroNameError('Hero name must be at least 2 characters.');
      return;
    }

    if (trimmedName.length > 20) {
      setHeroNameError('Hero name must be 20 characters or less.');
      return;
    }

    setHeroNameError('');
    void persistUserState({ ...userState, heroName: trimmedName });
    setScreen('avatar');
  }

  function continueFromAvatar() {
    const selectedClass = classDefinitions[selectedAvatar.heroClass];
    void persistUserState({
      ...userState,
      avatarEmoji: selectedClass.emoji,
      heroClass: selectedAvatar.heroClass,
      classVictoryCount: 0,
    });
    setScreen('quartermaster');
  }

  function completeOnboarding() {
    const selectedClass = classDefinitions[selectedAvatar.heroClass];
    void persistUserState({
      ...userState,
      heroName: heroNameInput.trim(),
      avatarEmoji: selectedClass.emoji,
      heroClass: selectedAvatar.heroClass,
      classVictoryCount: 0,
      onboardingComplete: true,
    });
    setQuestTitle('');
    setWinCondition('');
    setDifficulty('Normal');
    setQuestError('');
    setScreen('questBoard');
  }

  function openQuestBoard() {
    setQuestTitle('');
    setWinCondition('');
    setDifficulty('Normal');
    setQuestError('');
    setScreen('questBoard');
  }

  function applyQuestTemplate(template: QuestTemplate) {
    setQuestTitle(template.questTitle);
    setWinCondition(template.winCondition);
    setQuestError('');
  }

  function changeHeroClass(nextClass: HeroClass) {
    const definition = classDefinitions[nextClass];
    const nextState = {
      ...userState,
      avatarEmoji: definition.emoji,
      heroClass: nextClass,
      classVictoryCount: 0,
    };
    setSelectedAvatar({
      emoji: definition.emoji,
      heroClass: nextClass,
    });
    void persistUserState(nextState);
  }

  function enterDungeon() {
    const trimmedTitle = questTitle.trim();
    const trimmedWinCondition = winCondition.trim();
    const normalizedTitle = trimmedTitle.toLowerCase();
    const selectedDifficulty = difficultySettings[difficulty];

    if (trimmedTitle.length < 5) {
      setQuestError('Quest title must be at least 5 characters.');
      return;
    }

    if (vagueQuestTitles.has(normalizedTitle)) {
      setQuestError('Weak quest. Add a concrete action.');
      return;
    }

    if (!trimmedWinCondition) {
      setQuestError('Define what counts as victory.');
      return;
    }

    if (trimmedWinCondition.length < 10) {
      setQuestError('Win condition must be at least 10 characters.');
      return;
    }

    const nextQuest = {
      title: trimmedTitle,
      winCondition: trimmedWinCondition,
      durationMinutes: selectedDifficulty.durationMinutes,
      durationSeconds: selectedDifficulty.durationSeconds,
      difficulty,
      startedAt: new Date().toISOString(),
    };

    setQuestError('');
    setActiveQuest(nextQuest);
    setSecondsRemaining(selectedDifficulty.durationSeconds);
    setSelectedOutcome(null);
    setResultDetails(null);
    setShowAbandonConfirm(false);
    setScreen('dungeonRun');
  }

  function abandonRun() {
    setShowAbandonConfirm(false);
    setSecondsRemaining(0);
    void applyOutcome('Abandoned');
  }

  async function applyOutcome(outcome: Outcome) {
    if (!activeQuest || resultDetails) {
      return;
    }

    const endedAt = new Date().toISOString();
    const calculation = calculateResult(userState, activeQuest, outcome, endedAt);
    const nextSessions = [calculation.session, ...sessions];

    setSelectedOutcome(outcome);
    setResultDetails(calculation.details);
    setPendingReviewMilestone(
      getReviewMilestone(userState, calculation.nextUserState, activeQuest, outcome),
    );
    await Promise.all([persistUserState(calculation.nextUserState), persistSessions(nextSessions)]);
    setScreen('roomResult');
  }

  function returnToCamp() {
    const reviewMilestone = pendingReviewMilestone;
    setActiveQuest(null);
    setSelectedOutcome(null);
    setResultDetails(null);
    setShowAbandonConfirm(false);
    setPendingReviewMilestone(null);
    setScreen('camp');
    if (reviewMilestone) {
      void maybeRequestReview(reviewMilestone);
    }
  }

  function purchaseUpgrade(upgrade: UpgradeDefinition) {
    const ownedCount = userState.upgrades[upgrade.id];
    const isOwned = upgrade.maxPurchase !== null && ownedCount >= upgrade.maxPurchase;

    if (isOwned || userState.gold < upgrade.cost) {
      return;
    }

    const nextState = {
      ...userState,
      gold: userState.gold - upgrade.cost,
      upgrades: {
        ...userState.upgrades,
        [upgrade.id]: ownedCount + 1,
      },
    };

    void persistUserState(nextState);
  }

  function simulateMissedDay() {
    const simulatedState = {
      ...userState,
      lastVictoryDate: shiftLocalDate(getLocalDateString(new Date()), -3),
      currentStreak: Math.max(1, userState.currentStreak),
    };
    const streakCheck = checkMissedDayStreak(simulatedState, new Date());
    setCampNotice(streakCheck.notice || 'DEV TEST: missed-day check found no streak change.');
    void persistUserState(streakCheck.nextState);
  }

  async function maybeRequestReview(milestone: ReviewMilestone) {
    try {
      const storedUserValue = await AsyncStorage.getItem(USER_STORAGE_KEY);
      const latestState = storedUserValue ? parseStoredUserState(storedUserValue) : userState;

      if (!canPromptForReview(latestState, milestone, new Date())) {
        return;
      }

      const isAvailable = await StoreReview.isAvailableAsync();
      if (!isAvailable) {
        return;
      }

      await StoreReview.requestReview();
      const nextState = {
        ...latestState,
        lastReviewPromptDate: getLocalDateString(new Date()),
        reviewPromptCount: latestState.reviewPromptCount + 1,
        reviewMilestonesPrompted: {
          ...latestState.reviewMilestonesPrompted,
          [milestone]: true,
        },
      };
      await persistUserState(nextState);
    } catch {
      // Native review prompting is opportunistic; unavailable review support should stay invisible.
    }
  }

  function formatTime(totalSecondsToFormat: number) {
    const minutes = Math.floor(totalSecondsToFormat / 60);
    const seconds = totalSecondsToFormat % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  function getResultMessage(outcome: Outcome) {
    if (outcome === 'Victory') {
      return 'Room cleared. The dungeon goes deeper.';
    }

    if (outcome === 'Partial') {
      return 'Progress made, but the room still stands.';
    }

    if (outcome === 'Failed') {
      return 'The room survives. Regroup and try again.';
    }

    return 'You left the room before the fight was done.';
  }

  if (isLoading) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.loadingView}>
          <ActivityIndicator color="#f2c94c" size="large" />
          <Text style={styles.loadingText}>Opening the dungeon...</Text>
        </View>
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          key={screen}
          contentContainerStyle={[
            styles.scrollContent,
            screen === 'dungeonRun' && styles.dungeonRunScrollContent,
            {
              paddingBottom: scrollBottomSpacer,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          style={styles.screenScroll}
        >
          {screen === 'concept' && (
            <OnboardingCard eyebrow="Deep Work Dungeon">
              <Text style={styles.heroIcon}>🚪</Text>
              <Text style={styles.title}>Turn focus sessions into dungeon runs.</Text>
              <Text style={styles.bodyText}>
                Choose one real task. Define victory. Stay focused. Clear rooms. Earn XP.
              </Text>
              <PrimaryButton label="Begin" onPress={() => setScreen('heroName')} />
            </OnboardingCard>
          )}

          {screen === 'heroName' && (
            <OnboardingCard eyebrow="Hero Setup">
              <View style={styles.sceneBanner}>
                <Text style={styles.sceneIcon}>🏰</Text>
                <View style={styles.sceneCopy}>
                  <Text style={styles.sceneTitle}>Name the hero at the gate.</Text>
                  <Text style={styles.sceneText}>The dungeon remembers clean victories.</Text>
                </View>
              </View>
              <Text style={styles.title}>What should the dungeon call you?</Text>
              <TextInput
                autoCapitalize="words"
                maxLength={20}
                onChangeText={setHeroNameInput}
                placeholder="Hero name"
                placeholderTextColor="#9d8f77"
                style={styles.input}
                value={heroNameInput}
              />
              {heroNameError ? <Text style={styles.errorText}>{heroNameError}</Text> : null}
              <PrimaryButton label="Continue" onPress={continueFromHeroName} />
            </OnboardingCard>
          )}

          {screen === 'avatar' && (
            <OnboardingCard eyebrow="Choose Avatar">
              <Text style={styles.title}>Choose your class.</Text>
              <View style={styles.avatarGrid}>
                {avatarOptions.map((option) => {
                  const isSelected = option.heroClass === selectedAvatar.heroClass;
                  const classInfo = classDefinitions[option.heroClass];
                  return (
                    <Pressable
                      key={option.heroClass}
                      onPress={() => setSelectedAvatar(option)}
                      style={[
                        styles.avatarOption,
                        getClassCardStyle(option.heroClass),
                        isSelected && styles.avatarOptionSelected,
                      ]}
                    >
                      <Text style={styles.avatarEmoji}>{classInfo.emoji}</Text>
                      <Text style={styles.avatarLabel}>{option.heroClass}</Text>
                      <Text style={styles.abilityName}>{classInfo.abilityName}</Text>
                      <Text style={styles.abilityText}>{classInfo.abilityText}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <PrimaryButton label="Continue" onPress={continueFromAvatar} />
            </OnboardingCard>
          )}

          {screen === 'quartermaster' && (
            <OnboardingCard eyebrow="The Quartermaster">
              <Text style={styles.heroIcon}>🧾</Text>
              <QuartermasterNote>
                I&apos;ll track your quests, rewards, streaks, and dungeon progress. Your job is
                simpler: finish the room in front of you.
              </QuartermasterNote>
              <PrimaryButton label="Start First Quest" onPress={completeOnboarding} />
            </OnboardingCard>
          )}

          {screen === 'camp' && (
            <View style={styles.screenStack}>
              <View style={styles.header}>
                <Text style={styles.appTitle}>Deep Work Dungeon</Text>
                <Text style={styles.headerSubtitle}>Camp</Text>
              </View>

              <View style={styles.heroCard}>
                <Text style={styles.campAvatar}>{userState.avatarEmoji ?? '🛡️'}</Text>
                <View style={styles.heroDetails}>
                  <Text style={styles.heroName}>
                    Hero: {userState.heroName ?? 'Unnamed'} the {userState.heroClass ?? 'Knight'}
                  </Text>
                  <Text style={styles.statLine}>Level {userState.level}</Text>
                  <Text style={styles.classAbilityText}>
                    {activeClass.abilityName}: {activeClass.abilityText}
                  </Text>
                </View>
              </View>

              <View style={styles.classChangePanel}>
                <Text style={styles.optionLabel}>Class</Text>
                <View style={styles.classPillRow}>
                  {avatarOptions.map((option) => {
                    const classInfo = classDefinitions[option.heroClass];
                    const isSelected = option.heroClass === (userState.heroClass ?? 'Knight');
                    return (
                      <Pressable
                        accessibilityRole="button"
                        disabled={isSelected}
                        key={option.heroClass}
                        onPress={() => changeHeroClass(option.heroClass)}
                        style={[styles.classPill, isSelected && styles.classPillSelected]}
                      >
                        <Text style={styles.classPillText}>
                          {classInfo.emoji} {option.heroClass}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.subtleText}>Class changes apply to future sessions.</Text>
              </View>

              <StatCard label="XP to Next Level" value={`${userState.xp} / ${xpRequired}`}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${xpPercent}%` }]} />
                </View>
              </StatCard>

              <View style={styles.statGrid}>
                <StatCard label="Gold" value={`🪙 ${userState.gold}`} />
                <StatCard label="Current Streak" value={`🔥 ${userState.currentStreak} days`} />
                <StatCard label="Best Streak" value={`🛡️ ${userState.bestStreak} days`} />
                <StatCard label="Floor" value={`🚪 ${userState.currentFloor}`} />
                <StatCard label="Rooms Cleared" value={`${userState.roomsClearedOnFloor} / 5`} />
                <StatCard label="Hero HP" value={`${userState.heroHp} / 100`} />
                <StatCard label="Streak Shields" value={`🛡️ ${userState.upgrades.streakShield}`} />
              </View>

              {campNotice ? (
                <View style={styles.noticeBox}>
                  <Text style={styles.noticeText}>{campNotice}</Text>
                  <SecondaryButton label="Dismiss" onPress={dismissCampNotice} />
                </View>
              ) : null}

              <QuartermasterNote>
                {userState.heroHp === 0
                  ? 'Your hero is exhausted. Complete a Victory session to recover.'
                  : 'One clean quest. One clear victory condition. Then enter the room.'}
              </QuartermasterNote>

              <View style={styles.actionStack}>
                <SecondaryButton label="Quest Log" onPress={() => setScreen('questLog')} />
                <SecondaryButton label="Armory" onPress={() => setScreen('armory')} />
              </View>

              {__DEV__ ? (
                <View style={styles.devBox}>
                  <Text style={styles.devLabel}>Developer Test Tools</Text>
                  <SecondaryButton label="Dev: Simulate Missed Day" onPress={simulateMissedDay} />
                </View>
              ) : null}

              <View style={styles.resetBox}>
                <Text style={styles.resetLabel}>Testing</Text>
                {showResetConfirm ? (
                  <>
                    <Text style={styles.confirmText}>
                      Reset all hero progress, quest history, upgrades, and onboarding data?
                    </Text>
                    <View style={styles.actionStack}>
                      <DangerButton label="Reset App Data" onPress={() => void resetAppData()} />
                      <SecondaryButton label="Cancel" onPress={() => setShowResetConfirm(false)} />
                    </View>
                  </>
                ) : (
                  <DangerButton label="Reset App Data" onPress={() => setShowResetConfirm(true)} />
                )}
              </View>
            </View>
          )}

          {screen === 'questBoard' && (
            <View style={styles.screenStack}>
              <View style={styles.header}>
                <Text style={styles.appTitle}>Quest Board</Text>
                <Text style={styles.headerSubtitle}>Define victory before entering the room.</Text>
              </View>

              <View style={styles.prepPanel}>
                <Text style={styles.panelTitle}>Prepare the Room</Text>
                <Text style={styles.subtleText}>Pick a template or write your own quest.</Text>
                <View style={styles.templateGrid}>
                  {questTemplates.map((template) => (
                    <Pressable
                      accessibilityRole="button"
                      key={template.name}
                      onPress={() => applyQuestTemplate(template)}
                      style={({ pressed }) => [
                        styles.templateChip,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.templateText}>{template.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <TextInput
                autoCapitalize="sentences"
                onChangeText={setQuestTitle}
                placeholder="Quest title"
                placeholderTextColor="#9d8f77"
                style={styles.input}
                value={questTitle}
              />
              <TextInput
                autoCapitalize="sentences"
                multiline
                onChangeText={setWinCondition}
                placeholder="Win condition"
                placeholderTextColor="#9d8f77"
                style={[styles.input, styles.textArea]}
                value={winCondition}
              />

              <OptionGroup
                label="Difficulty"
                options={difficultyOptions.map((option) => ({
                  label: `${option} - ${difficultySettings[option].durationMinutes} min`,
                  value: option,
                }))}
                selectedValue={difficulty}
                onSelect={setDifficulty}
              />

              {questError ? <Text style={styles.errorText}>{questError}</Text> : null}

              <QuartermasterNote>
                A real quest leaves evidence behind. Define what victory looks like before you
                start.
              </QuartermasterNote>

              <SecondaryButton label="Return to Camp" onPress={returnToCamp} />
            </View>
          )}

          {screen === 'dungeonRun' && activeQuest && (
            <>
            <View style={[styles.dungeonRunScreen, { minHeight: dungeonRunHeight }]}>
              <ImageBackground
                source={dungeonRoomBackground}
                resizeMode="cover"
                style={styles.dungeonRunBackground}
              >
                <View
                  style={[
                    styles.dungeonRunShade,
                    {
                      paddingBottom:
                        insets.bottom + DUNGEON_RUN_LAYOUT.stage.shadeBottomBreathingRoomPx,
                    },
                  ]}
                >
                  <View style={styles.dungeonTopStack}>
                    <View style={styles.questPlaque}>
                      <Image
                        source={questPlaqueFrame}
                        resizeMode="stretch"
                        style={styles.dungeonFrameImage}
                      />
                      <View style={styles.questPlaqueTextLayer}>
                        <Text numberOfLines={2} style={styles.dungeonPlaqueTitle}>
                          {activeQuest.title}
                        </Text>
                        <Text numberOfLines={2} style={styles.dungeonPlaqueSubtext}>
                          {activeQuest.winCondition}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.timerPlaque}>
                      <Image
                        source={timerPlaqueFrame}
                        resizeMode="stretch"
                        style={styles.dungeonFrameImage}
                      />
                      <View style={styles.timerPlaqueTextLayer}>
                        <Text style={styles.timerLabel}>Focus Session</Text>
                        <Text style={styles.dungeonTimerText}>{formatTime(secondsRemaining)}</Text>
                        <Text style={styles.timerSubtext}>{activeQuest.difficulty} room - no pause</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.battleStage}>
                    <Image
                      resizeMode="contain"
                      source={heroSpriteLayout.image}
                        style={[
                          styles.heroSprite,
                          {
                          bottom: spriteFloorBaselinePx + heroSpriteLayout.baselineOffsetPx,
                          height: heroSpriteHeight,
                          left: heroSpriteLeft,
                          width: heroSpriteWidth,
                        },
                      ]}
                    />
                    <Image
                      resizeMode="contain"
                      source={enemySpriteLayout.image}
                        style={[
                          styles.enemySprite,
                          {
                          bottom: spriteFloorBaselinePx + enemySpriteLayout.baselineOffsetPx,
                          height: enemySpriteHeight,
                          left: enemySpriteLeft,
                          width: enemySpriteWidth,
                        },
                      ]}
                    />

                    <View style={styles.enemyHpGroup}>
                      <Text style={styles.enemyName}>Room Warden</Text>
                      <View style={styles.enemyStatusPanel}>
                        <Image
                          source={hpFrame}
                          resizeMode="stretch"
                          style={styles.dungeonFrameImage}
                        />
                        <View style={styles.enemyHpHeader}>
                          <Text style={styles.enemyHpLabel}>HP</Text>
                          <Text style={styles.enemyHpValue}>{enemyHp} / 100</Text>
                        </View>
                        <View style={styles.hpMeterClip}>
                          <View style={[styles.enemyHpFill, { width: `${enemyHp}%` }]} />
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={styles.dungeonBottomStack}>
                    <View style={styles.focusPanel}>
                      <Image
                        source={focusFrame}
                        resizeMode="stretch"
                        style={styles.dungeonFrameImage}
                      />
                      <View style={styles.focusHeader}>
                        <Text style={styles.focusLabel}>Focus Meter</Text>
                        <Text style={styles.focusValue}>{focusPercent}%</Text>
                      </View>
                      <View style={styles.focusMeterClip}>
                        <View style={[styles.focusMeterFill, { width: `${focusPercent}%` }]} />
                      </View>
                    </View>

                    {showAbandonConfirm ? (
                      <View style={styles.dungeonConfirmPanel}>
                        <Text style={styles.dungeonConfirmText}>
                          Abandon this run? Your hero takes damage and the room is not cleared.
                        </Text>
                        <View style={styles.dungeonConfirmActions}>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setShowAbandonConfirm(false)}
                            style={({ pressed }) => [
                              styles.keepFightingButton,
                              pressed && styles.buttonPressed,
                            ]}
                          >
                            <Text style={styles.keepFightingText}>Keep Fighting</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            onPress={abandonRun}
                            style={({ pressed }) => [
                              styles.dungeonAbandonButton,
                              pressed && styles.buttonPressed,
                            ]}
                          >
                            <Text style={styles.dungeonAbandonText}>Abandon</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setShowAbandonConfirm(true)}
                        style={({ pressed }) => [
                          styles.dungeonAbandonPressable,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <View style={styles.dungeonAbandonFrame}>
                          <Image
                            source={abandonFrame}
                            resizeMode="stretch"
                            style={styles.dungeonFrameImage}
                          />
                          <Text style={styles.dungeonAbandonFrameText}>Abandon Run</Text>
                        </View>
                      </Pressable>
                    )}
                  </View>
                </View>
              </ImageBackground>
            </View>
            <View style={[styles.screenStack, styles.hiddenDungeonLegacy]}>
              <View style={styles.dungeonHeader}>
                <Text style={styles.headerSubtitle}>Dungeon Run</Text>
                <Text style={styles.timerText}>{formatTime(secondsRemaining)}</Text>
                <Text style={styles.subtleText}>{activeQuest.difficulty} room • no pause</Text>
              </View>

              <View style={styles.roomCard}>
                <View style={styles.roomDoor}>
                  <Text style={styles.roomDoorText}>ROOM IN PROGRESS</Text>
                </View>
                <View style={styles.combatRow}>
                  <View style={styles.combatant}>
                    <Text style={styles.combatEmoji}>{userState.avatarEmoji ?? '🛡️'}</Text>
                    <Text style={styles.combatName}>{userState.heroName ?? 'Hero'}</Text>
                    <Text style={styles.combatSubtle}>{userState.heroClass ?? 'Knight'}</Text>
                  </View>
                  <Text style={styles.versusText}>vs</Text>
                  <View style={styles.combatant}>
                    <Text style={styles.combatEmoji}>👹</Text>
                    <Text style={styles.combatName}>Room Warden</Text>
                    <Text style={styles.combatSubtle}>HP {enemyHp} / 100</Text>
                  </View>
                </View>

                <Text style={[styles.questTitle, styles.dungeonQuestTitle]}>
                  {activeQuest.title}
                </Text>
                <Text style={[styles.winCondition, styles.dungeonWinCondition]}>
                  {activeQuest.winCondition}
                </Text>

                <Meter label="Enemy HP" value={enemyHp} tone="danger" />
                <Meter label="Focus Meter" value={focusPercent} tone="focus" />
              </View>

              {showAbandonConfirm ? (
                <View style={styles.confirmBox}>
                  <Text style={styles.confirmText}>
                    Abandon this run? Your hero takes damage and the room is not cleared.
                  </Text>
                  <View style={styles.actionStack}>
                    <PrimaryButton
                      label="Keep Fighting"
                      onPress={() => setShowAbandonConfirm(false)}
                    />
                    <DangerButton label="Abandon" onPress={abandonRun} />
                  </View>
                </View>
              ) : (
                <DangerButton label="Abandon Run" onPress={() => setShowAbandonConfirm(true)} />
              )}
            </View>
            </>
          )}

          {screen === 'roomResult' && activeQuest && (
            <View style={styles.screenStack}>
              <View style={styles.header}>
                <Text style={styles.appTitle}>Room Result</Text>
                <Text style={styles.headerSubtitle}>{activeQuest.title}</Text>
              </View>

              <View
                style={[
                  styles.card,
                  selectedOutcome && resultDetails
                    ? styles[outcomeStyles[selectedOutcome]]
                    : undefined,
                ]}
              >
                {selectedOutcome && resultDetails ? (
                  <>
                    <Text style={styles.resultOutcome}>{selectedOutcome}</Text>
                    <Text style={styles.bodyText}>{getResultMessage(selectedOutcome)}</Text>
                    <ResultDetailsList details={resultDetails} />
                    {resultDetails.hpAfter === 0 ? (
                      <Text style={styles.warningText}>
                        Your hero is exhausted. Complete a Victory session to recover.
                      </Text>
                    ) : null}
                    <PrimaryButton label="Return to Camp" onPress={returnToCamp} />
                  </>
                ) : (
                  <>
                    <Text style={styles.title}>Did you complete the win condition?</Text>
                    <Text style={styles.winCondition}>{activeQuest.winCondition}</Text>
                    <View style={styles.actionStack}>
                      <PrimaryButton label="Victory" onPress={() => void applyOutcome('Victory')} />
                      <SecondaryButton
                        label="Partial"
                        onPress={() => void applyOutcome('Partial')}
                      />
                      <DangerButton label="Failed" onPress={() => void applyOutcome('Failed')} />
                    </View>
                  </>
                )}
              </View>
            </View>
          )}

          {screen === 'armory' && (
            <View style={styles.screenStack}>
              <View style={styles.header}>
                <Text style={styles.appTitle}>Armory</Text>
                <Text style={styles.headerSubtitle}>Gold: 🪙 {userState.gold}</Text>
              </View>

              <SecondaryButton label="Return to Camp" onPress={returnToCamp} />

              <View style={styles.sceneBanner}>
                <Text style={styles.sceneIcon}>⚒️</Text>
                <View style={styles.sceneCopy}>
                  <Text style={styles.sceneTitle}>Upgrade future runs.</Text>
                  <Text style={styles.sceneText}>Gold becomes tools. Tools become deeper rooms.</Text>
                </View>
              </View>

              {userState.gold === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No gold yet.</Text>
                  <Text style={styles.emptyText}>
                    Clear rooms to earn gold, then return here to buy upgrades.
                  </Text>
                </View>
              ) : null}

              <QuartermasterNote>
                Upgrades apply to future runs only. Partial, Failed, and Abandoned runs do not
                receive upgrade bonuses.
              </QuartermasterNote>

              {upgradeDefinitions.map((upgrade) => (
                <UpgradeCard
                  key={upgrade.id}
                  upgrade={upgrade}
                  userState={userState}
                  onPurchase={() => purchaseUpgrade(upgrade)}
                />
              ))}

            </View>
          )}

          {screen === 'questLog' && (
            <View style={styles.screenStack}>
              <View style={styles.header}>
                <Text style={styles.appTitle}>Quest Log</Text>
                <Text style={styles.headerSubtitle}>{sessions.length} recorded rooms</Text>
              </View>

              <SecondaryButton label="Return to Camp" onPress={returnToCamp} />

              <View style={styles.sceneBanner}>
                <Text style={styles.sceneIcon}>📜</Text>
                <View style={styles.sceneCopy}>
                  <Text style={styles.sceneTitle}>Rooms remembered.</Text>
                  <Text style={styles.sceneText}>Newest records stay at the top.</Text>
                </View>
              </View>

              {sessions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No rooms recorded yet.</Text>
                  <Text style={styles.emptyText}>
                    Finish or abandon a Dungeon Run and the Quest Log will remember it.
                  </Text>
                </View>
              ) : (
                sessions.map((session) => (
                  <View key={session.id} style={styles.logCard}>
                    <Text style={styles.logDate}>{formatDateTime(session.endedAt)}</Text>
                    <Text style={styles.questTitle}>{session.questTitle}</Text>
                    <Text style={styles.winCondition}>{session.winCondition}</Text>
                    <View style={styles.logGrid}>
                      <LogField label="Duration" value={formatDuration(session.durationMinutes)} />
                      <LogField label="Difficulty" value={session.difficulty} />
                      <LogField label="Outcome" value={session.outcome} />
                      <LogField label="XP" value={`${session.xpGained}`} />
                      <LogField label="Gold" value={`${session.goldGained}`} />
                      <LogField label="Room Cleared" value={session.roomCleared ? 'Yes' : 'No'} />
                    </View>
                  </View>
                ))
              )}

            </View>
          )}
        </ScrollView>
        {showFixedActionFooter ? (
          <View
            style={[
              styles.safeActionFooter,
              {
                paddingBottom: insets.bottom + 12,
              },
            ]}
          >
            {screen === 'camp' ? (
              <PrimaryButton label="Start Quest" onPress={openQuestBoard} />
            ) : (
              <PrimaryButton label="Enter Dungeon" onPress={enterDungeon} />
            )}
          </View>
        ) : null}
        {showBottomGutter ? (
          <View
            pointerEvents="none"
            style={[styles.bottomSafeAreaGutter, { height: bottomGutterHeight }]}
          />
        ) : null}
        <StatusBar style="light" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function calculateResult(
  currentUserState: UserState,
  activeQuest: ActiveQuest,
  outcome: Outcome,
  endedAt: string,
) {
  const baseRewards = difficultySettings[activeQuest.difficulty];
  const multipliers = outcomeMultipliers[outcome];
  const heroClass = currentUserState.heroClass ?? 'Knight';
  const classBonusLines: string[] = [];
  let xpMultiplier = multipliers.xp;
  let goldMultiplier = multipliers.gold;

  if (outcome === 'Partial' && heroClass === 'Rogue') {
    xpMultiplier = 0.5;
    goldMultiplier = 0.4;
    classBonusLines.push('Salvage Instinct improved Partial rewards.');
  }

  if (outcome === 'Victory') {
    if (heroClass === 'Mage') {
      xpMultiplier += 0.1;
      classBonusLines.push('Arcane Focus added +10% Victory XP.');
    }
    if (currentUserState.upgrades.sharperFocus > 0) {
      xpMultiplier += 0.1;
    }
    if (activeQuest.difficulty === 'Boss' && currentUserState.upgrades.bossHunter > 0) {
      xpMultiplier += 0.25;
    }
    if (currentUserState.upgrades.goldFinder > 0) {
      goldMultiplier += 0.1;
    }
  }
  const xpGained = Math.floor(baseRewards.xp * xpMultiplier);
  const goldGained = Math.floor(baseRewards.gold * goldMultiplier);
  const roomCleared = multipliers.roomCleared;
  const today = getLocalDateString(new Date(endedAt));

  let nextLevel = currentUserState.level;
  let nextXp = currentUserState.xp + xpGained;
  while (nextXp >= nextLevel * 100) {
    nextXp -= nextLevel * 100;
    nextLevel += 1;
  }

  const nextClassVictoryCount =
    outcome === 'Victory' ? currentUserState.classVictoryCount + 1 : currentUserState.classVictoryCount;
  const rangerBonusRooms =
    heroClass === 'Ranger' && outcome === 'Victory' && nextClassVictoryCount % 4 === 0 ? 1 : 0;
  if (rangerBonusRooms > 0) {
    classBonusLines.push('Pathfinder cleared +1 bonus room.');
  }

  let nextFloor = currentUserState.currentFloor;
  let nextRooms = currentUserState.roomsClearedOnFloor + (roomCleared ? 1 + rangerBonusRooms : 0);
  while (nextRooms >= roomsPerFloor) {
    nextRooms -= roomsPerFloor;
    nextFloor += 1;
  }

  const shouldIncreaseStreak =
    outcome === 'Victory' && currentUserState.lastVictoryDate !== today;
  const nextCurrentStreak = shouldIncreaseStreak
    ? currentUserState.currentStreak + 1
    : currentUserState.currentStreak;
  const nextBestStreak = Math.max(currentUserState.bestStreak, nextCurrentStreak);

  let nextHp = currentUserState.heroHp;
  if (outcome === 'Victory') {
    nextHp = Math.min(100, nextHp + 5);
  } else if (outcome === 'Failed') {
    const hpLoss = heroClass === 'Knight' ? 5 : 10;
    if (heroClass === 'Knight') {
      classBonusLines.push('Iron Will reduced Failed HP loss.');
    }
    nextHp = Math.max(0, nextHp - hpLoss);
  } else if (outcome === 'Abandoned') {
    const hpLoss = heroClass === 'Knight' ? 10 : 20;
    if (heroClass === 'Knight') {
      classBonusLines.push('Iron Will reduced Abandoned HP loss.');
    }
    nextHp = Math.max(0, nextHp - hpLoss);
  }

  const nextUserState: UserState = {
    ...currentUserState,
    level: nextLevel,
    xp: nextXp,
    gold: currentUserState.gold + goldGained,
    currentStreak: nextCurrentStreak,
    bestStreak: nextBestStreak,
    lastVictoryDate: outcome === 'Victory' ? today : currentUserState.lastVictoryDate,
    currentFloor: nextFloor,
    roomsClearedOnFloor: nextRooms,
    heroHp: nextHp,
    classVictoryCount: nextClassVictoryCount,
  };

  const session: SessionRecord = {
    id: `session_${Date.now()}`,
    questTitle: activeQuest.title,
    winCondition: activeQuest.winCondition,
    durationMinutes: activeQuest.durationMinutes,
    difficulty: activeQuest.difficulty,
    startedAt: activeQuest.startedAt,
    endedAt,
    outcome,
    xpGained,
    goldGained,
    roomCleared,
  };

  const details: ResultDetails = {
    outcome,
    xpGained,
    goldGained,
    roomCleared,
    levelBefore: currentUserState.level,
    levelAfter: nextLevel,
    streakBefore: currentUserState.currentStreak,
    streakAfter: nextCurrentStreak,
    floorBefore: currentUserState.currentFloor,
    floorAfter: nextFloor,
    roomsBefore: currentUserState.roomsClearedOnFloor,
    roomsAfter: nextRooms,
    hpBefore: currentUserState.heroHp,
    hpAfter: nextHp,
    classBonusLines,
  };

  return { details, nextUserState, session };
}

function getBottomGutterHeight(bottomInset: number) {
  return bottomInset + 36;
}

function getScrollBottomSpacer(screen: Screen, bottomInset: number) {
  if (screen === 'camp' || screen === 'questBoard') {
    return bottomInset + 104;
  }

  if (screen === 'armory' || screen === 'questLog') {
    return getBottomGutterHeight(bottomInset) + 36;
  }

  return bottomInset + 28;
}

function getClassCardStyle(heroClass: HeroClass) {
  if (heroClass === 'Mage') {
    return styles.mageClassCard;
  }

  if (heroClass === 'Knight') {
    return styles.knightClassCard;
  }

  if (heroClass === 'Ranger') {
    return styles.rangerClassCard;
  }

  return styles.rogueClassCard;
}

function getReviewMilestone(
  previousState: UserState,
  nextState: UserState,
  activeQuest: ActiveQuest,
  outcome: Outcome,
): ReviewMilestone | null {
  if (outcome !== 'Victory') {
    return null;
  }

  if (
    nextState.currentFloor > previousState.currentFloor &&
    !previousState.reviewMilestonesPrompted.firstFloorCleared
  ) {
    return 'firstFloorCleared';
  }

  if (
    activeQuest.difficulty === 'Boss' &&
    !previousState.reviewMilestonesPrompted.firstBossVictory
  ) {
    return 'firstBossVictory';
  }

  if (
    previousState.currentStreak < 3 &&
    nextState.currentStreak >= 3 &&
    !previousState.reviewMilestonesPrompted.firstThreeDayStreak
  ) {
    return 'firstThreeDayStreak';
  }

  return null;
}

function canPromptForReview(userState: UserState, milestone: ReviewMilestone, now: Date) {
  if (userState.reviewMilestonesPrompted[milestone]) {
    return false;
  }

  if (userState.reviewPromptCount >= maxReviewPrompts) {
    return false;
  }

  if (!userState.lastReviewPromptDate) {
    return true;
  }

  const earliestNextPrompt = shiftLocalDate(userState.lastReviewPromptDate, reviewCooldownDays);
  return getLocalDateString(now) >= earliestNextPrompt;
}

function parseStoredUserState(value: string): UserState {
  try {
    const parsed = JSON.parse(value) as Partial<UserState>;
    return normalizeUserState(parsed);
  } catch {
    return defaultUserState;
  }
}

function normalizeUserState(value: Partial<UserState>): UserState {
  return {
    ...defaultUserState,
    ...value,
    onboardingComplete: typeof value.onboardingComplete === 'boolean' ? value.onboardingComplete : false,
    heroName: typeof value.heroName === 'string' ? value.heroName : null,
    avatarEmoji: typeof value.avatarEmoji === 'string' ? value.avatarEmoji : null,
    heroClass: isHeroClass(value.heroClass) ? value.heroClass : null,
    level: normalizeNumber(value.level, defaultUserState.level, 1),
    xp: normalizeNumber(value.xp, defaultUserState.xp, 0),
    gold: normalizeNumber(value.gold, defaultUserState.gold, 0),
    currentStreak: normalizeNumber(value.currentStreak, defaultUserState.currentStreak, 0),
    bestStreak: normalizeNumber(value.bestStreak, defaultUserState.bestStreak, 0),
    lastVictoryDate: typeof value.lastVictoryDate === 'string' ? value.lastVictoryDate : null,
    currentFloor: normalizeNumber(value.currentFloor, defaultUserState.currentFloor, 1),
    roomsClearedOnFloor: Math.min(
      roomsPerFloor - 1,
      normalizeNumber(value.roomsClearedOnFloor, defaultUserState.roomsClearedOnFloor, 0),
    ),
    heroHp: Math.min(100, normalizeNumber(value.heroHp, defaultUserState.heroHp, 0)),
    classVictoryCount: normalizeNumber(value.classVictoryCount, 0, 0),
    lastReviewPromptDate:
      typeof value.lastReviewPromptDate === 'string' ? value.lastReviewPromptDate : null,
    reviewPromptCount: normalizeNumber(value.reviewPromptCount, 0, 0),
    reviewMilestonesPrompted: normalizeReviewMilestones(value.reviewMilestonesPrompted),
    upgrades: {
      sharperFocus: normalizeNumber(value.upgrades?.sharperFocus, 0, 0),
      goldFinder: normalizeNumber(value.upgrades?.goldFinder, 0, 0),
      streakShield: normalizeNumber(value.upgrades?.streakShield, 0, 0),
      bossHunter: normalizeNumber(value.upgrades?.bossHunter, 0, 0),
    },
  };
}

function normalizeReviewMilestones(value: unknown): Record<ReviewMilestone, boolean> {
  const record = value && typeof value === 'object' ? (value as Partial<Record<ReviewMilestone, boolean>>) : {};
  return {
    firstFloorCleared: record.firstFloorCleared === true,
    firstBossVictory: record.firstBossVictory === true,
    firstThreeDayStreak: record.firstThreeDayStreak === true,
  };
}

function parseStoredSessions(value: string): SessionRecord[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isSessionRecord);
  } catch {
    return [];
  }
}

function normalizeNumber(value: unknown, fallback: number, minimum: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.floor(value))
    : fallback;
}

function isHeroClass(value: unknown): value is HeroClass {
  return value === 'Mage' || value === 'Knight' || value === 'Ranger' || value === 'Rogue';
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === 'Easy' || value === 'Normal' || value === 'Boss';
}

function isOutcome(value: unknown): value is Outcome {
  return value === 'Victory' || value === 'Partial' || value === 'Failed' || value === 'Abandoned';
}

function isSessionRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Partial<SessionRecord>;
  return (
    typeof record.id === 'string' &&
    typeof record.questTitle === 'string' &&
    typeof record.winCondition === 'string' &&
    typeof record.durationMinutes === 'number' &&
    isDifficulty(record.difficulty) &&
    typeof record.startedAt === 'string' &&
    typeof record.endedAt === 'string' &&
    isOutcome(record.outcome) &&
    typeof record.xpGained === 'number' &&
    typeof record.goldGained === 'number' &&
    typeof record.roomCleared === 'boolean'
  );
}

function checkMissedDayStreak(userState: UserState, now: Date): StreakCheckResult {
  if (!userState.lastVictoryDate || userState.currentStreak <= 0) {
    return { nextState: userState, notice: '' };
  }

  const today = getLocalDateString(now);
  const yesterday = shiftLocalDate(today, -1);

  if (userState.lastVictoryDate === today || userState.lastVictoryDate === yesterday) {
    return { nextState: userState, notice: '' };
  }

  if (userState.lastVictoryDate > yesterday) {
    return { nextState: userState, notice: '' };
  }

  if (userState.upgrades.streakShield > 0) {
    return {
      nextState: {
        ...userState,
        lastVictoryDate: yesterday,
        upgrades: {
          ...userState.upgrades,
          streakShield: userState.upgrades.streakShield - 1,
        },
      },
      notice: 'Streak Shield used. Your streak survived one missed day.',
    };
  }

  return {
    nextState: {
      ...userState,
      currentStreak: 0,
    },
    notice: 'Your streak broke. Start a new run to rebuild it.',
  };
}

function getLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftLocalDate(dateString: string, days: number) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return getLocalDateString(date);
}

function formatDateTime(isoDate: string) {
  return new Date(isoDate).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(durationMinutes: number) {
  if (durationMinutes < 1) {
    return '10 sec';
  }

  return `${durationMinutes} min`;
}

function OnboardingCard({ children, eyebrow }: { children: ReactNode; eyebrow: string }) {
  return (
    <View style={styles.centeredStack}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function QuartermasterNote({ children }: { children: ReactNode }) {
  return (
    <View style={styles.note}>
      <Text style={styles.noteLabel}>Quartermaster Note</Text>
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

function StatCard({
  children,
  label,
  value,
}: {
  children?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {children}
    </View>
  );
}

function ResultDetailsList({ details }: { details: ResultDetails }) {
  const streakText =
    details.streakAfter > details.streakBefore
      ? `Streak increased to ${details.streakAfter}`
      : `Streak remains ${details.streakAfter}`;
  const floorText =
    details.floorAfter > details.floorBefore
      ? `Advanced to floor ${details.floorAfter}`
      : `Floor ${details.floorAfter}, room ${details.roomsAfter} / ${roomsPerFloor}`;

  return (
    <View style={styles.resultList}>
      <ResultLine label="Room Cleared" value={details.roomCleared ? 'Yes' : 'No'} />
      <ResultLine label="XP Gained" value={`${details.xpGained}`} />
      <ResultLine label="Gold Gained" value={`${details.goldGained}`} />
      <ResultLine
        label="Level"
        value={
          details.levelAfter > details.levelBefore
            ? `${details.levelBefore} -> ${details.levelAfter}`
            : `${details.levelAfter}`
        }
      />
      <ResultLine label="Streak" value={streakText} />
      <ResultLine label="Floor Progress" value={floorText} />
      <ResultLine label="Hero HP" value={`${details.hpBefore} -> ${details.hpAfter}`} />
      {details.classBonusLines.map((line) => (
        <ResultLine key={line} label="Class Bonus" value={line} />
      ))}
    </View>
  );
}

function ResultLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.resultLine}>
      <Text style={styles.resultLineLabel}>{label}</Text>
      <Text style={styles.resultLineValue}>{value}</Text>
    </View>
  );
}

function LogField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.logField}>
      <Text style={styles.logFieldLabel}>{label}</Text>
      <Text style={styles.logValue}>{value}</Text>
    </View>
  );
}

function UpgradeCard({
  onPurchase,
  upgrade,
  userState,
}: {
  onPurchase: () => void;
  upgrade: UpgradeDefinition;
  userState: UserState;
}) {
  const ownedCount = userState.upgrades[upgrade.id];
  const isOwned = upgrade.maxPurchase !== null && ownedCount >= upgrade.maxPurchase;
  const canAfford = userState.gold >= upgrade.cost;
  const buttonLabel = isOwned ? 'Owned' : canAfford ? `Buy for ${upgrade.cost} gold` : 'Not enough gold';

  return (
    <View style={styles.upgradeCard}>
      <View style={styles.upgradeHeader}>
        <View style={styles.upgradeTitleBlock}>
          <Text style={styles.upgradeName}>{upgrade.name}</Text>
          <Text style={styles.upgradeEffect}>{upgrade.effect}</Text>
        </View>
        <Text style={styles.upgradeCost}>🪙 {upgrade.cost}</Text>
      </View>
      <View style={styles.upgradeMetaRow}>
        <Text style={styles.upgradeMetaText}>Owned: {ownedCount}</Text>
        <Text style={styles.upgradeMetaText}>
          Max: {upgrade.maxPurchase === null ? 'Stackable' : upgrade.maxPurchase}
        </Text>
      </View>
      <PrimaryButton label={buttonLabel} onPress={onPurchase} disabled={isOwned || !canAfford} />
    </View>
  );
}

function OptionGroup<T extends string | number>({
  label,
  onSelect,
  options,
  selectedValue,
}: {
  label: string;
  onSelect: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  selectedValue: T;
}) {
  return (
    <View style={styles.optionGroup}>
      <Text style={styles.optionLabel}>{label}</Text>
      <View style={styles.segmentRow}>
        {options.map((option) => {
          const isSelected = option.value === selectedValue;
          return (
            <Pressable
              key={option.label}
              onPress={() => onSelect(option.value)}
              style={[styles.segmentButton, isSelected && styles.segmentButtonSelected]}
            >
              <Text style={[styles.segmentText, isSelected && styles.segmentTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Meter({ label, tone, value }: { label: string; tone: 'danger' | 'focus'; value: number }) {
  return (
    <View style={styles.meterBlock}>
      <View style={styles.meterLabelRow}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statLabel}>{value}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            tone === 'danger' ? styles.dangerFill : styles.focusFill,
            { width: `${value}%` },
          ]}
        />
      </View>
    </View>
  );
}

function PrimaryButton({
  disabled,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.disabledButton,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  disabled,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.disabledButton,
      ]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function DangerButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.dangerButton, pressed && styles.buttonPressed]}
    >
      <Text style={styles.dangerButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionStack: {
    gap: 12,
  },
  appTitle: {
    color: '#fff1c8',
    fontSize: 28,
    fontWeight: '900',
  },
  avatarEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginVertical: 12,
  },
  avatarLabel: {
    color: '#fff3cf',
    fontSize: 16,
    fontWeight: '900',
  },
  avatarOption: {
    alignItems: 'flex-start',
    backgroundColor: '#172235',
    borderColor: '#7b6637',
    borderRadius: 8,
    borderWidth: 2,
    minHeight: 154,
    padding: 14,
    width: '47%',
  },
  avatarOptionSelected: {
    backgroundColor: '#26395a',
    borderColor: '#f5c24b',
  },
  bodyText: {
    color: '#142033',
    fontSize: 17,
    lineHeight: 25,
    marginBottom: 24,
    textAlign: 'center',
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  bottomSafeAreaGutter: {
    backgroundColor: '#0e1727',
    bottom: 0,
    elevation: 10,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 10,
  },
  campAvatar: {
    fontSize: 42,
  },
  safeActionFooter: {
    backgroundColor: '#0e1727',
    borderTopColor: '#9b7a32',
    borderTopWidth: 1,
    elevation: 8,
    paddingHorizontal: 18,
  },
  abilityName: {
    color: '#f5c24b',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  abilityText: {
    color: '#eadbb8',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  card: {
    backgroundColor: '#fff2cf',
    borderColor: '#c3943d',
    borderRadius: 8,
    borderWidth: 2,
    padding: 20,
    width: '100%',
  },
  centeredStack: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  combatEmoji: {
    fontSize: 42,
    textAlign: 'center',
  },
  combatName: {
    color: '#fff1c8',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  combatRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  combatSubtle: {
    color: '#dac792',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  combatant: {
    alignItems: 'center',
    backgroundColor: '#142238',
    borderColor: '#7b6637',
    borderRadius: 8,
    borderWidth: 2,
    flex: 1,
    gap: 4,
    minHeight: 126,
    justifyContent: 'center',
    padding: 10,
  },
  classAbilityText: {
    color: '#eadbb8',
    fontSize: 14,
    lineHeight: 20,
  },
  classChangePanel: {
    backgroundColor: '#132036',
    borderColor: '#8b713a',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  classPill: {
    alignItems: 'center',
    backgroundColor: '#1b2a42',
    borderColor: '#6c5d35',
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 42,
    minWidth: '47%',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  classPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  classPillSelected: {
    backgroundColor: '#293f63',
    borderColor: '#f5c24b',
  },
  classPillText: {
    color: '#f7e7bd',
    fontSize: 14,
    fontWeight: '900',
  },
  mageClassCard: {
    borderColor: '#7c70c6',
  },
  knightClassCard: {
    borderColor: '#d6a642',
  },
  rangerClassCard: {
    borderColor: '#6f9d59',
  },
  rogueClassCard: {
    borderColor: '#d98244',
  },
  confirmBox: {
    backgroundColor: '#2a1d22',
    borderColor: '#d06b5f',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  confirmText: {
    color: '#f7e7bd',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 24,
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: '#8f3430',
    borderColor: '#e18862',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  dangerButtonText: {
    color: '#fff0e9',
    fontSize: 16,
    fontWeight: '900',
  },
  dangerFill: {
    backgroundColor: '#d86a5f',
  },
  devBox: {
    backgroundColor: '#172235',
    borderColor: '#806840',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  devLabel: {
    color: '#c8b899',
    fontSize: 12,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.48,
  },
  dungeonHeader: {
    alignItems: 'center',
    backgroundColor: '#111c2e',
    borderColor: '#2e425f',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  dungeonAbandonButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#8f1f25',
    borderColor: '#f1a06d',
    borderRadius: 10,
    borderWidth: 2,
    elevation: 8,
    justifyContent: 'center',
    minHeight: 54,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    width: '100%',
  },
  dungeonAbandonFrame: {
    flex: 1,
    justifyContent: 'center',
  },
  dungeonAbandonPressable: {
    alignSelf: 'center',
    aspectRatio: DUNGEON_RUN_LAYOUT.abandonButton.aspectRatio,
    width: DUNGEON_RUN_LAYOUT.abandonButton.widthPct,
  },
  dungeonAbandonText: {
    color: '#fff3df',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.4,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  dungeonAbandonFrameText: {
    color: '#fff3df',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.4,
    position: 'absolute',
    textAlign: 'center',
    textTransform: 'uppercase',
    transform: [{ translateY: DUNGEON_RUN_LAYOUT.abandonButton.textOffsetYPx }],
    ...DUNGEON_RUN_LAYOUT.abandonButton.textInset,
  },
  dungeonConfirmActions: {
    gap: 10,
  },
  dungeonConfirmPanel: {
    backgroundColor: 'rgba(17, 13, 17, 0.9)',
    borderColor: '#c79b52',
    borderRadius: 12,
    borderWidth: 2,
    gap: 12,
    padding: 12,
    width: '100%',
  },
  dungeonConfirmText: {
    color: '#f7e7bd',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'center',
  },
  dungeonPlaqueSubtext: {
    color: '#d8c59b',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
  },
  dungeonPlaqueTitle: {
    color: '#fff0bc',
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 24,
    textAlign: 'center',
  },
  dungeonRunBackground: {
    flex: 1,
    width: '100%',
  },
  dungeonRunScreen: {
    backgroundColor: '#060912',
    width: '100%',
  },
  dungeonRunScrollContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  dungeonRunShade: {
    backgroundColor: 'rgba(4, 7, 13, 0.16)',
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: DUNGEON_RUN_LAYOUT.stage.shadePaddingTopPx,
  },
  dungeonBottomStack: {
    alignSelf: 'center',
    gap: DUNGEON_RUN_LAYOUT.bottomStack.gapPx,
    width: DUNGEON_RUN_LAYOUT.stage.contentWidthPct,
  },
  dungeonFrameImage: {
    ...StyleSheet.absoluteFill,
    height: '100%',
    width: '100%',
  },
  dungeonTopStack: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: DUNGEON_RUN_LAYOUT.topStack.gapPx,
    width: DUNGEON_RUN_LAYOUT.stage.contentWidthPct,
  },
  dungeonTimerText: {
    color: '#ffd76a',
    fontSize: 50,
    fontWeight: '900',
    lineHeight: 54,
    textAlign: 'center',
    textShadowColor: '#4b2508',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 5,
    transform: [{ translateY: DUNGEON_RUN_LAYOUT.timerPlaque.valueOffsetYPx }],
  },
  enemyHpFill: {
    backgroundColor: '#c82432',
    height: '100%',
  },
  enemyHpHeader: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
    ...DUNGEON_RUN_LAYOUT.hpFrame.headerInset,
  },
  enemyHpLabel: {
    color: '#f4c872',
    fontSize: 9,
    fontWeight: '900',
  },
  enemyHpValue: {
    color: '#fff0cf',
    fontSize: 9,
    fontWeight: '900',
  },
  enemyHpGroup: {
    alignItems: 'center',
    position: 'absolute',
    right: DUNGEON_RUN_LAYOUT.wardenName.rightPct,
    top: DUNGEON_RUN_LAYOUT.wardenName.topPx,
    width: DUNGEON_RUN_LAYOUT.wardenName.widthPct,
  },
  enemyName: {
    color: '#fff0cf',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 1,
    textAlign: 'center',
    textShadowColor: '#140b08',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    transform: [{ translateY: DUNGEON_RUN_LAYOUT.wardenName.textOffsetYPx }],
  },
  enemySprite: {
    position: 'absolute',
  },
  enemyStatusPanel: {
    aspectRatio: DUNGEON_RUN_LAYOUT.hpFrame.aspectRatio,
    width: DUNGEON_RUN_LAYOUT.hpFrame.widthPct,
  },
  focusHeader: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
    ...DUNGEON_RUN_LAYOUT.focusMeter.headerInset,
  },
  focusLabel: {
    color: '#ecddba',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  focusMeterFill: {
    backgroundColor: '#38d6f6',
    height: '100%',
  },
  focusPanel: {
    alignSelf: 'center',
    aspectRatio: DUNGEON_RUN_LAYOUT.focusMeter.aspectRatio,
    width: DUNGEON_RUN_LAYOUT.focusMeter.widthPct,
  },
  focusValue: {
    color: '#a5f2ff',
    fontSize: 13,
    fontWeight: '900',
  },
  heroSprite: {
    position: 'absolute',
  },
  hiddenDungeonLegacy: {
    display: 'none',
  },
  keepFightingButton: {
    alignItems: 'center',
    backgroundColor: '#22364e',
    borderColor: '#83b6c2',
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 48,
  },
  keepFightingText: {
    color: '#e7fbff',
    fontSize: 15,
    fontWeight: '900',
  },
  questPlaque: {
    alignSelf: 'center',
    aspectRatio: DUNGEON_RUN_LAYOUT.questPlaque.aspectRatio,
    width: DUNGEON_RUN_LAYOUT.questPlaque.widthPct,
  },
  questPlaqueTextLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: DUNGEON_RUN_LAYOUT.questPlaque.textOffsetYPx }],
    ...DUNGEON_RUN_LAYOUT.questPlaque.textInset,
  },
  timerLabel: {
    color: '#ecddba',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
    transform: [{ translateY: DUNGEON_RUN_LAYOUT.timerPlaque.labelOffsetYPx }],
  },
  timerPlaque: {
    alignSelf: 'center',
    aspectRatio: DUNGEON_RUN_LAYOUT.timerPlaque.aspectRatio,
    width: DUNGEON_RUN_LAYOUT.timerPlaque.widthPct,
  },
  timerPlaqueTextLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    ...DUNGEON_RUN_LAYOUT.timerPlaque.textInset,
  },
  timerSubtext: {
    color: '#d9c693',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    transform: [{ translateY: DUNGEON_RUN_LAYOUT.timerPlaque.subtitleOffsetYPx }],
  },
  battleStage: {
    flex: 1,
    marginVertical: 0,
    minHeight: DUNGEON_RUN_LAYOUT.battleStage.minHeightPx,
    position: 'relative',
    width: '100%',
  },
  hpMeterClip: {
    backgroundColor: 'rgba(20, 6, 8, 0.8)',
    borderRadius: 999,
    overflow: 'hidden',
    position: 'absolute',
    ...DUNGEON_RUN_LAYOUT.hpFrame.fillInset,
  },
  focusMeterClip: {
    backgroundColor: 'rgba(7, 15, 24, 0.82)',
    borderRadius: 999,
    overflow: 'hidden',
    position: 'absolute',
    ...DUNGEON_RUN_LAYOUT.focusMeter.fillInset,
  },
  emptyState: {
    backgroundColor: '#fff2cf',
    borderColor: '#c3943d',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  emptyText: {
    color: '#263143',
    fontSize: 15,
    lineHeight: 22,
  },
  emptyTitle: {
    color: '#10203a',
    fontSize: 19,
    fontWeight: '900',
  },
  errorText: {
    color: '#ffb3a7',
    fontSize: 14,
    marginBottom: 4,
  },
  eyebrow: {
    color: '#c28a20',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  focusFill: {
    backgroundColor: '#f2c94c',
  },
  header: {
    gap: 4,
  },
  headerSubtitle: {
    color: '#eadbb8',
    fontSize: 18,
    fontWeight: '700',
  },
  heroCard: {
    alignItems: 'center',
    backgroundColor: '#132036',
    borderColor: '#b98b37',
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 16,
    padding: 16,
  },
  heroDetails: {
    flex: 1,
    gap: 4,
  },
  heroIcon: {
    fontSize: 54,
    marginBottom: 16,
    textAlign: 'center',
  },
  heroName: {
    color: '#fff1c8',
    fontSize: 19,
    fontWeight: '800',
  },
  input: {
    backgroundColor: '#fff4d7',
    borderColor: '#c3943d',
    borderRadius: 8,
    borderWidth: 1,
    color: '#1f1a2d',
    fontSize: 18,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  keyboardView: {
    flex: 1,
  },
  loadingText: {
    color: '#f7e7bd',
    fontSize: 16,
    marginTop: 12,
  },
  loadingView: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  logCard: {
    backgroundColor: '#fff2cf',
    borderColor: '#c3943d',
    borderRadius: 8,
    borderWidth: 2,
    gap: 10,
    padding: 16,
  },
  logDate: {
    color: '#936719',
    fontSize: 13,
    fontWeight: '900',
  },
  logField: {
    backgroundColor: '#f5dfac',
    borderColor: '#d0a44c',
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    gap: 4,
    minWidth: '47%',
    padding: 10,
  },
  logFieldLabel: {
    color: '#745018',
    fontSize: 13,
    fontWeight: '800',
  },
  logGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  logValue: {
    color: '#142033',
    fontSize: 15,
    fontWeight: '900',
  },
  meterBlock: {
    gap: 5,
  },
  meterLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  note: {
    backgroundColor: '#fff2cf',
    borderColor: '#c3943d',
    borderRadius: 8,
    borderWidth: 2,
    gap: 6,
    padding: 14,
  },
  noteLabel: {
    color: '#936719',
    fontSize: 13,
    fontWeight: '800',
  },
  noteText: {
    color: '#142033',
    fontSize: 15,
    lineHeight: 22,
  },
  noticeBox: {
    backgroundColor: '#142238',
    borderColor: '#f5c24b',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  noticeText: {
    color: '#f7e7bd',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
  },
  optionGroup: {
    gap: 8,
  },
  optionLabel: {
    color: '#fff1c8',
    fontSize: 15,
    fontWeight: '900',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#f5c24b',
    borderColor: '#fff1a8',
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 12,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#22182d',
    fontSize: 17,
    fontWeight: '900',
  },
  progressFill: {
    backgroundColor: '#f2c94c',
    borderRadius: 999,
    height: '100%',
  },
  progressTrack: {
    backgroundColor: '#2b3b54',
    borderRadius: 999,
    height: 10,
    marginTop: 10,
    overflow: 'hidden',
  },
  panelTitle: {
    color: '#fff1c8',
    fontSize: 18,
    fontWeight: '900',
  },
  prepPanel: {
    backgroundColor: '#132036',
    borderColor: '#b98b37',
    borderRadius: 8,
    borderWidth: 2,
    gap: 10,
    padding: 14,
  },
  questTitle: {
    color: '#10203a',
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 8,
  },
  dungeonQuestTitle: {
    color: '#fff1c8',
  },
  dungeonWinCondition: {
    color: '#eadbb8',
  },
  resultLine: {
    borderBottomColor: '#d9bd77',
    borderBottomWidth: 1,
    gap: 4,
    paddingVertical: 8,
  },
  resultLineLabel: {
    color: '#745018',
    fontSize: 13,
    fontWeight: '800',
  },
  resultLineValue: {
    color: '#142033',
    fontSize: 16,
    fontWeight: '900',
  },
  resultList: {
    marginBottom: 8,
  },
  resultOutcome: {
    color: '#10203a',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'center',
  },
  abandonedResult: {
    backgroundColor: '#fff1d2',
    borderColor: '#9d6a5d',
  },
  failedResult: {
    backgroundColor: '#fff0e8',
    borderColor: '#d06b5f',
  },
  partialResult: {
    backgroundColor: '#fff4d7',
    borderColor: '#806840',
  },
  victoryResult: {
    backgroundColor: '#fff6d8',
    borderColor: '#f5c24b',
  },
  roomCard: {
    backgroundColor: '#101a2b',
    borderColor: '#3f5575',
    borderRadius: 8,
    borderWidth: 2,
    gap: 18,
    padding: 16,
  },
  roomDoor: {
    alignItems: 'center',
    backgroundColor: '#172640',
    borderColor: '#b98b37',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 9,
  },
  roomDoorText: {
    color: '#f2c94c',
    fontSize: 12,
    fontWeight: '900',
  },
  resetBox: {
    backgroundColor: '#201e2a',
    borderColor: '#7f2e38',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  resetLabel: {
    color: '#ffb3a7',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  safeArea: {
    backgroundColor: '#0e1727',
    flex: 1,
  },
  screenStack: {
    gap: 16,
    width: '100%',
  },
  screenScroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#1c2b43',
    borderColor: '#7d6a38',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: '#f7e7bd',
    fontSize: 16,
    fontWeight: '800',
  },
  sceneBanner: {
    alignItems: 'center',
    backgroundColor: '#fff2cf',
    borderColor: '#c3943d',
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  sceneCopy: {
    flex: 1,
    gap: 3,
  },
  sceneIcon: {
    fontSize: 30,
  },
  sceneText: {
    color: '#263143',
    fontSize: 14,
    lineHeight: 20,
  },
  sceneTitle: {
    color: '#10203a',
    fontSize: 17,
    fontWeight: '900',
  },
  segmentButton: {
    alignItems: 'center',
    backgroundColor: '#1b2a42',
    borderColor: '#6c5d35',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minWidth: '47%',
    minHeight: 46,
    paddingHorizontal: 8,
  },
  segmentButtonSelected: {
    backgroundColor: '#b98b37',
    borderColor: '#f5c24b',
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentText: {
    color: '#eadbb8',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  segmentTextSelected: {
    color: '#10203a',
  },
  statCard: {
    backgroundColor: '#172640',
    borderColor: '#7b6637',
    borderRadius: 8,
    borderWidth: 2,
    flexGrow: 1,
    gap: 5,
    minWidth: '47%',
    padding: 14,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statLabel: {
    color: '#dac792',
    fontSize: 13,
    fontWeight: '700',
  },
  statLine: {
    color: '#eadbb8',
    fontSize: 15,
    fontWeight: '700',
  },
  statValue: {
    color: '#fff1c8',
    fontSize: 18,
    fontWeight: '900',
  },
  subtleText: {
    color: '#dac792',
    fontSize: 13,
    lineHeight: 18,
  },
  templateChip: {
    alignItems: 'center',
    backgroundColor: '#fff2cf',
    borderColor: '#c3943d',
    borderRadius: 8,
    borderWidth: 2,
    minHeight: 38,
    minWidth: '47%',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  templateText: {
    color: '#142033',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  textArea: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  timerText: {
    color: '#fff1c8',
    fontSize: 58,
    fontWeight: '900',
  },
  title: {
    color: '#10203a',
    fontSize: 29,
    fontWeight: '900',
    lineHeight: 35,
    marginBottom: 14,
    textAlign: 'center',
  },
  versusText: {
    color: '#f2c94c',
    fontSize: 16,
    fontWeight: '900',
  },
  upgradeCard: {
    backgroundColor: '#fff2cf',
    borderColor: '#c3943d',
    borderRadius: 8,
    borderWidth: 2,
    gap: 12,
    padding: 16,
  },
  upgradeCost: {
    color: '#936719',
    fontSize: 16,
    fontWeight: '900',
  },
  upgradeEffect: {
    color: '#263143',
    fontSize: 14,
    lineHeight: 20,
  },
  upgradeHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  upgradeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  upgradeMetaText: {
    color: '#745018',
    fontSize: 13,
    fontWeight: '800',
  },
  upgradeName: {
    color: '#10203a',
    fontSize: 20,
    fontWeight: '900',
  },
  upgradeTitleBlock: {
    flex: 1,
    gap: 4,
  },
  warningText: {
    color: '#ffb3a7',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
  winCondition: {
    color: '#2b3547',
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 23,
  },
});
