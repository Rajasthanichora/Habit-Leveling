import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Modal,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useHabits } from '../hooks/useHabits';
import { CategoryDef, SoundConfig, DEFAULT_SOUND_CONFIG, ApiProvider } from '../services/types';
import { CategoryConfig, Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { CategoryIcon } from '../components/feature/CategoryIcon';
import { SVG_ICON_NAMES } from '../utils/svgIcons';
import { ALARM_SOUND_NAMES, playAlarmSound, vibrateOnTap } from '../services/soundService';
import { loadApiConfig, saveApiKey, saveApiModel, testApiKey, testModel, fetchModels, loadActiveProvider, saveActiveProvider, ModelOption } from '../services/apiService';

const DEFAULT_COLORS = [
  '#FF6B35', '#FF3B5C', '#2979FF', '#9B59B6', '#2ECC71',
  '#E74C3C', '#F39C12', '#1ABC9C', '#3498DB', '#E91E63',
  '#00BCD4', '#FF9800', '#8BC34A', '#795548', '#607D8B',
  '#673AB7', '#FFEB3B', '#009688', '#CDDC39', '#FF5722',
];

const PRESET_ICONS = [
  'favorite', 'school', 'work', 'star', 'home',
  'directions-run', 'book', 'code', 'music-note', 'restaurant',
  'fitness-center', 'self-improvement', 'bedtime', 'water-drop', 'coffee',
  'pets', 'train', 'shopping-cart', 'brush', 'photo-camera',
];

type SettingsView = 'menu' | 'categories' | 'sound' | 'api' | 'api_gemini' | 'api_openrouter';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { categories, addCategory, updateCategory, deleteCategory, soundConfig, updateSoundConfig } = useHabits();

  const [view, setView] = useState<SettingsView>('menu');
  const [showForm, setShowForm] = useState(false);
  const [editingCat, setEditingCat] = useState<CategoryDef | null>(null);
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState(DEFAULT_COLORS[0]);
  const [formIcon, setFormIcon] = useState('');
  const [showActionsFor, setShowActionsFor] = useState<string | null>(null);

  // ── API State ──
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savedApiKey, setSavedApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<ApiProvider>('gemini');
  const [activeProvider, setActiveProvider] = useState<ApiProvider>('gemini');
  const [tempSelectedModel, setTempSelectedModel] = useState('');
  const [testingModel, setTestingModel] = useState(false);
  const [modelTestResult, setModelTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const defaultCats: CategoryDef[] = useMemo(
    () => Object.entries(CategoryConfig).map(([id, cfg]) => ({
      id, name: cfg.label, color: cfg.color, icon: cfg.icon,
    })),
    []
  );

  const allCats = useMemo(() => [...defaultCats, ...categories], [defaultCats, categories]);

  // ── API Hooks (must be at top level, not inside conditionals) ──
  const isApiDetail = view === 'api_gemini' || view === 'api_openrouter';
  const apiDetailProvider = isApiDetail ? currentProvider : 'gemini';
  const loadProviderConfig = useCallback(async () => {
    const config = await loadApiConfig();
    const cfg = apiDetailProvider === 'gemini' ? config.gemini : config.openrouter;
    setApiKeyInput(cfg.apiKey || '');
    setSavedApiKey(cfg.apiKey || '');
    setSelectedModel(cfg.model || '');
    setTestResult(null);
  }, [apiDetailProvider]);

  useEffect(() => {
    loadActiveProvider().then(setActiveProvider);
  }, []);

  useEffect(() => {
    if (isApiDetail) {
      loadProviderConfig();
    }
  }, [isApiDetail, loadProviderConfig]);

  const openAdd = () => {
    setEditingCat(null);
    setFormName('');
    setFormColor(DEFAULT_COLORS[0]);
    setFormIcon('');
    setShowForm(true);
  };

  const openEdit = (cat: CategoryDef) => {
    setEditingCat(cat);
    setFormName(cat.name);
    setFormColor(cat.color);
    setFormIcon(cat.icon ?? '');
    setShowForm(true);
    setShowActionsFor(null);
  };

  const handleDelete = (cat: CategoryDef) => {
    setShowActionsFor(null);
    Alert.alert('Delete Category', 'Delete "' + cat.name + '"? Habits using this category will be unaffected.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCategory(cat.id) },
    ]);
  };

  const handleSave = () => {
    if (!formName.trim()) {
      Alert.alert('Missing Name', 'Please enter a category name.');
      return;
    }
    if (editingCat) {
      updateCategory({ ...editingCat, name: formName.trim(), color: formColor, icon: formIcon || undefined });
    } else {
      addCategory({
        id: 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        name: formName.trim(),
        color: formColor,
        icon: formIcon || undefined,
      });
    }
    setShowForm(false);
  };

  // ── Menu View ──
  if (view === 'menu') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
        <View style={styles.menuList}>
          <Pressable style={styles.menuRow} onPress={() => setView('categories')}>
            <View style={[styles.menuIcon, { backgroundColor: Colors.primary }]}>
              <MaterialIcons name="category" size={22} color="#fff" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuLabel}>Categories</Text>
              <Text style={styles.menuDesc}>Manage habit categories</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => setView('sound')}>
            <View style={[styles.menuIcon, { backgroundColor: Colors.primary }]}>
              <MaterialIcons name="volume-up" size={22} color="#fff" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuLabel}>Sound</Text>
              <Text style={styles.menuDesc}>Vibration, alarms & notification sounds</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => setView('api')}>
            <View style={[styles.menuIcon, { backgroundColor: Colors.primary }]}>
              <MaterialIcons name="api" size={22} color="#fff" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuLabel}>API</Text>
              <Text style={styles.menuDesc}>Configure Gemini & OpenRouter</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Sound View ──
  if (view === 'sound') {
    const handleSoundChange = (key: keyof SoundConfig, value: boolean | string) => {
      updateSoundConfig({ ...soundConfig, [key]: value });
    };

    const alarmSounds = ALARM_SOUND_NAMES;

    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => setView('menu')} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Sound</Text>
        </View>

        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Vibration on Tap */}
          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Vibration on Tap</Text>
              <Text style={styles.soundDesc}>Haptic feedback when pressing buttons</Text>
            </View>
            <Switch
              value={soundConfig.vibrationOnTap}
              onValueChange={(val) => { handleSoundChange('vibrationOnTap', val); vibrateOnTap(); }}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {/* Completion Sound */}
          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Completion Sound</Text>
              <Text style={styles.soundDesc}>Play sound when a habit is completed</Text>
            </View>
            <Switch
              value={soundConfig.completionSound}
              onValueChange={(val) => handleSoundChange('completionSound', val)}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {/* Delete Sound */}
          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Delete Sound</Text>
              <Text style={styles.soundDesc}>Play sound when a habit is deleted</Text>
            </View>
            <Switch
              value={soundConfig.deleteSound}
              onValueChange={(val) => handleSoundChange('deleteSound', val)}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {/* Notification Sound */}
          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Notification Sound</Text>
              <Text style={styles.soundDesc}>Play sound for habit reminders</Text>
            </View>
            <Switch
              value={soundConfig.notificationSound}
              onValueChange={(val) => handleSoundChange('notificationSound', val)}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {/* Alarm Sound */}
          <View style={styles.soundSectionLabel}>
            <Text style={styles.sectionLabelText}>ALARM SOUND</Text>
          </View>
          <Text style={styles.soundSectionDesc}>
            Choose the default alarm sound for reminders & notifications
          </Text>

          {alarmSounds.map((name) => (
            <Pressable
              key={name}
              style={[styles.alarmRow, soundConfig.alarmSound === name && styles.alarmRowSelected]}
              onPress={() => handleSoundChange('alarmSound', name)}
            >
              <MaterialIcons
                name={soundConfig.alarmSound === name ? 'radio-button-checked' : 'radio-button-unchecked'}
                size={20}
                color={soundConfig.alarmSound === name ? Colors.primary : Colors.textSecondary}
              />
              <Text style={[styles.alarmName, soundConfig.alarmSound === name && styles.alarmNameSelected]}>
                {name.charAt(0).toUpperCase() + name.slice(1)}
              </Text>
              <Pressable
                style={styles.previewBtn}
                onPress={() => playAlarmSound(name)}
                hitSlop={8}
              >
                <MaterialIcons name="play-circle-outline" size={24} color={Colors.primary} />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── API Main View ──
  if (view === 'api') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => setView('menu')} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>API</Text>
        </View>
        <View style={styles.menuList}>
          <Pressable style={styles.menuRow} onPress={() => { setCurrentProvider('gemini'); setView('api_gemini'); }}>
            <View style={[styles.menuIcon, { backgroundColor: '#4285F4' }]}>
              <MaterialIcons name="smart-toy" size={22} color="#fff" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuLabel}>Gemini</Text>
              <Text style={styles.menuDesc}>Google Gemini API configuration</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => { setCurrentProvider('openrouter'); setView('api_openrouter'); }}>
            <View style={[styles.menuIcon, { backgroundColor: '#843DCE' }]}>
              <MaterialIcons name="open-in-new" size={22} color="#fff" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuLabel}>Open Router</Text>
              <Text style={styles.menuDesc}>OpenRouter API configuration</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
          </Pressable>
        </View>

        {/* Active Provider */}
        <View style={styles.apiDivider} />
        <View style={styles.activeProviderSection}>
          <Text style={styles.apiSectionLabel}>ACTIVE PROVIDER</Text>
          <Text style={styles.soundSectionDesc}>Select which provider to use for AI features</Text>
          <View style={styles.activeProviderRow}>
            <Pressable
              style={[styles.activeProviderBtn, activeProvider === 'gemini' && styles.activeProviderBtnSelected]}
              onPress={() => { setActiveProvider('gemini'); saveActiveProvider('gemini'); }}
            >
              <MaterialIcons
                name={activeProvider === 'gemini' ? 'radio-button-checked' : 'radio-button-unchecked'}
                size={20}
                color={activeProvider === 'gemini' ? '#4285F4' : Colors.textSecondary}
              />
              <Text style={[styles.activeProviderLabel, activeProvider === 'gemini' && { color: '#4285F4', fontWeight: FontWeight.bold }]} numberOfLines={1}>
                Gemini
              </Text>
              {activeProvider === 'gemini' && (
                <View style={styles.activeProviderBadge}>
                  <Text style={styles.activeProviderBadgeText}>Active</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              style={[styles.activeProviderBtn, activeProvider === 'openrouter' && styles.activeProviderBtnSelected]}
              onPress={() => { setActiveProvider('openrouter'); saveActiveProvider('openrouter'); }}
            >
              <MaterialIcons
                name={activeProvider === 'openrouter' ? 'radio-button-checked' : 'radio-button-unchecked'}
                size={20}
                color={activeProvider === 'openrouter' ? '#843DCE' : Colors.textSecondary}
              />
              <Text style={[styles.activeProviderLabel, activeProvider === 'openrouter' && { color: '#843DCE', fontWeight: FontWeight.bold }]} numberOfLines={1}>
                Open Router
              </Text>
              {activeProvider === 'openrouter' && (
                <View style={[styles.activeProviderBadge, { backgroundColor: 'rgba(132,61,206,0.15)' }]}>
                  <Text style={[styles.activeProviderBadgeText, { color: '#843DCE' }]}>Active</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ── API Detail View (Gemini / OpenRouter) ──
  if (view === 'api_gemini' || view === 'api_openrouter') {
    const provider = currentProvider;
    const providerLabel = provider === 'gemini' ? 'Gemini' : 'Open Router';

    const handleSaveKey = async () => {
      if (!apiKeyInput.trim()) {
        Alert.alert('Missing Key', 'Please enter an API key.');
        return;
      }
      setSavingKey(true);
      try {
        await saveApiKey(provider, apiKeyInput.trim());
        setSavedApiKey(apiKeyInput.trim());
        Alert.alert('Saved', `${providerLabel} API key saved successfully.`);
      } catch {
        Alert.alert('Error', 'Failed to save API key.');
      }
      setSavingKey(false);
    };

    const handleTestKey = async () => {
      const keyToTest = apiKeyInput.trim() || savedApiKey;
      if (!keyToTest) {
        Alert.alert('Missing Key', 'Enter or save an API key first.');
        return;
      }
      setTestingKey(true);
      setTestResult(null);
      const result = await testApiKey(provider, keyToTest);
      setTestResult(result);
      setTestingKey(false);
    };

    const handleFetchModels = async () => {
      const key = savedApiKey || apiKeyInput.trim();
      if (!key) {
        Alert.alert('Missing Key', 'Save an API key first to fetch models.');
        return;
      }
      setLoadingModels(true);
      const fetched = await fetchModels(provider, key);
      setModels(fetched);
      setLoadingModels(false);
      if (fetched.length === 0) {
        Alert.alert('No Models', 'No free models found for this API key.');
      }
    };

    const handleSelectModel = (model: string) => {
      setTempSelectedModel(model);
      setModelTestResult(null);
    };

    const handleSaveModel = async () => {
      const modelToSave = tempSelectedModel || selectedModel;
      if (!modelToSave) {
        Alert.alert('No Selection', 'Please select a model first.');
        return;
      }
      await saveApiModel(provider, modelToSave);
      setSelectedModel(modelToSave);
      setShowModelPicker(false);
      setModelTestResult(null);
    };

    const handleTestModel = async () => {
      const key = apiKeyInput.trim() || savedApiKey;
      if (!key) {
        Alert.alert('Missing Key', 'Save an API key first.');
        return;
      }
      const modelToTest = tempSelectedModel || selectedModel;
      if (!modelToTest) {
        Alert.alert('No Model', 'Select a model first.');
        return;
      }
      setTestingModel(true);
      setModelTestResult(null);
      const result = await testModel(provider, key, modelToTest);
      setModelTestResult(result);
      setTestingModel(false);
    };

    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => setView('api')} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{providerLabel}</Text>
        </View>

        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Step Indicators */}
          <View style={styles.stepIndicator}>
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, savedApiKey ? styles.stepDotDone : styles.stepDotActive]}>
                <MaterialIcons name={savedApiKey ? 'check' : 'looks-one'} size={14} color="#fff" />
              </View>
              <Text style={[styles.stepLabel, savedApiKey ? styles.stepLabelDone : null]}>API Key</Text>
            </View>
            <View style={styles.stepLine} />
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, selectedModel ? styles.stepDotDone : styles.stepDotPending]}>
                <MaterialIcons name={selectedModel ? 'check' : 'looks-two'} size={14} color="#fff" />
              </View>
              <Text style={[styles.stepLabel, selectedModel ? styles.stepLabelDone : null]}>Model</Text>
            </View>
          </View>

          {/* API Key */}
          <Text style={styles.apiSectionLabel}>API KEY</Text>
          <TextInput
            style={styles.apiInput}
            value={apiKeyInput}
            onChangeText={(t) => { setApiKeyInput(t); setTestResult(null); }}
            placeholder={savedApiKey ? 'Saved key hidden ••••••••' : `Enter ${providerLabel} API key`}
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          {savedApiKey ? (
            <Text style={styles.apiStatusSaved}>Key saved on device</Text>
          ) : null}

          <View style={styles.apiBtnRow}>
            <Pressable
              style={[styles.apiBtn, styles.apiBtnPrimary, savingKey && styles.apiBtnDisabled]}
              onPress={handleSaveKey}
              disabled={savingKey}
            >
              {savingKey ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="save" size={18} color="#fff" />
                  <Text style={styles.apiBtnText}>Save</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[styles.apiBtn, styles.apiBtnOutline, testingKey && styles.apiBtnDisabled]}
              onPress={handleTestKey}
              disabled={testingKey}
            >
              {testingKey ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <MaterialIcons name="check-circle" size={18} color={Colors.primary} />
                  <Text style={[styles.apiBtnText, { color: Colors.primary }]}>Test</Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Test Result */}
          {testResult && (
            <View style={[styles.apiTestResult, testResult.success ? styles.apiTestSuccess : styles.apiTestFail]}>
              <MaterialIcons
                name={testResult.success ? 'check-circle' : 'error'}
                size={18}
                color={testResult.success ? Colors.success : Colors.danger}
              />
              <Text style={[styles.apiTestResultText, { color: testResult.success ? Colors.success : Colors.danger }]}>
                {testResult.message}
              </Text>
            </View>
          )}

          {/* Model Selection */}
          <View style={styles.apiDivider} />
          <Text style={styles.apiSectionLabel}>MODEL</Text>

          <Pressable
            style={styles.apiModelRow}
            onPress={() => { handleFetchModels(); setShowModelPicker(true); }}
          >
            <MaterialIcons name="model-training" size={20} color={Colors.textSecondary} />
            <View style={styles.apiModelInfo}>
              <Text style={styles.apiModelLabel}>Selected Model</Text>
              <Text style={styles.apiModelValue}>{selectedModel || 'None selected'}</Text>
            </View>
            {loadingModels ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
            )}
          </Pressable>

          {models.length > 0 && (
            <Text style={styles.apiModelCount}>{models.length} free model{models.length !== 1 ? 's' : ''} available</Text>
          )}
        </ScrollView>

        {/* Model Picker Modal */}
        <Modal visible={showModelPicker} transparent animationType="slide">
          <Pressable style={styles.modalOverlay} onPress={() => { setShowModelPicker(false); setModelTestResult(null); setTempSelectedModel(''); }}>
            <View style={[styles.modelPickerSheet, { paddingBottom: insets.bottom + 24 }]}>
              <View style={styles.modelPickerHeader}>
                <Text style={styles.modelPickerTitle}>Select Model</Text>
                <Pressable onPress={() => { setShowModelPicker(false); setModelTestResult(null); setTempSelectedModel(''); }} hitSlop={8}>
                  <MaterialIcons name="close" size={22} color={Colors.textPrimary} />
                </Pressable>
              </View>
              {models.length === 0 ? (
                <View style={styles.modelPickerEmpty}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.modelPickerEmptyText}>Loading models...</Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {models.map((m) => (
                    <Pressable
                      key={m.id}
                      style={[styles.modelPickerItem, (tempSelectedModel || selectedModel) === m.id && styles.modelPickerItemSelected]}
                      onPress={() => handleSelectModel(m.id)}
                    >
                      <MaterialIcons
                        name={(tempSelectedModel || selectedModel) === m.id ? 'radio-button-checked' : 'radio-button-unchecked'}
                        size={20}
                        color={(tempSelectedModel || selectedModel) === m.id ? Colors.primary : Colors.textSecondary}
                      />
                      <View style={styles.modelPickerItemInfo}>
                        <Text style={[styles.modelPickerItemName, (tempSelectedModel || selectedModel) === m.id && { color: Colors.primary }]}>
                          {m.name}
                        </Text>
                        <Text style={styles.modelPickerItemId}>{m.id}</Text>
                      </View>
                      {m.free && (
                        <View style={styles.modelPickerFreeBadge}>
                          <Text style={styles.modelPickerFreeText}>Free</Text>
                        </View>
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              {/* Model Test Result */}
              {modelTestResult && (
                <View style={[styles.apiTestResult, modelTestResult.success ? styles.apiTestSuccess : styles.apiTestFail]}>
                  <MaterialIcons
                    name={modelTestResult.success ? 'check-circle' : 'error'}
                    size={18}
                    color={modelTestResult.success ? Colors.success : Colors.danger}
                  />
                  <Text style={[styles.apiTestResultText, { color: modelTestResult.success ? Colors.success : Colors.danger }]}>
                    {modelTestResult.message}
                  </Text>
                </View>
              )}

              {/* Model Action Buttons */}
              <View style={styles.modelPickerActions}>
                <Pressable
                  style={[styles.apiBtn, styles.apiBtnOutline, (testingModel || !(tempSelectedModel || selectedModel)) && styles.apiBtnDisabled]}
                  onPress={handleTestModel}
                  disabled={testingModel || !(tempSelectedModel || selectedModel)}
                >
                  {testingModel ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <>
                      <MaterialIcons name="check-circle" size={18} color={Colors.primary} />
                      <Text style={[styles.apiBtnText, { color: Colors.primary }]}>Test Model</Text>
                    </>
                  )}
                </Pressable>
                {tempSelectedModel && tempSelectedModel !== selectedModel && (
                  <Pressable
                    style={[styles.apiBtn, styles.apiBtnPrimary]}
                    onPress={handleSaveModel}
                  >
                    <MaterialIcons name="save" size={18} color="#fff" />
                    <Text style={styles.apiBtnText}>Save</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </Pressable>
        </Modal>
      </View>
    );
  }

  // ── Categories View ──
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => setView('menu')} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Categories</Text>
        <Pressable style={styles.addBtn} onPress={openAdd}>
          <MaterialIcons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {allCats.map((cat) => (
          <View key={cat.id} style={styles.catRow}>
            <View style={[styles.catIcon, { backgroundColor: cat.color }]}>
              <CategoryIcon icon={cat.icon || 'category'} color={cat.color} size={20} />
            </View>
            <Text style={styles.catName}>{cat.name}</Text>
            <View style={[styles.catDot, { backgroundColor: cat.color }]} />
            <Pressable
              style={styles.catActionBtn}
              onPress={() => setShowActionsFor(showActionsFor === cat.id ? null : cat.id)}
              hitSlop={8}
            >
              <MaterialIcons
                name={showActionsFor === cat.id ? 'expand-less' : 'more-horiz'}
                size={20}
                color={Colors.textSecondary}
              />
            </Pressable>
            {showActionsFor === cat.id && (
              <View style={styles.actions}>
                <Pressable style={styles.actionBtn} onPress={() => openEdit(cat)}>
                  <MaterialIcons name="edit" size={18} color={Colors.primary} />
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>
                {!defaultCats.find((d) => d.id === cat.id) && (
                  <Pressable style={styles.actionBtn} onPress={() => handleDelete(cat)}>
                    <MaterialIcons name="delete" size={18} color={Colors.danger} />
                    <Text style={[styles.actionText, { color: Colors.danger }]}>Delete</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ))}
        {allCats.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No categories yet. Tap + to add one.</Text>
          </View>
        )}
      </ScrollView>

      {/* Add/Edit Category Modal */}
      <Modal visible={showForm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCat ? 'Edit Category' : 'New Category'}</Text>
              <Pressable onPress={() => setShowForm(false)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={Colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Category Name</Text>
              <TextInput
                style={styles.input}
                value={formName}
                onChangeText={setFormName}
                placeholder="e.g. Fitness, Reading..."
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={[styles.label, { marginTop: Spacing.md }]}>Color</Text>
              <View style={styles.colorGrid}>
                {DEFAULT_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.colorBox, { backgroundColor: c }, formColor === c && styles.colorSelected]}
                    onPress={() => setFormColor(c)}
                  />
                ))}
              </View>

              <View style={styles.placeholderBox}>
                <Text style={styles.placeholderText}>RGB & Opacity sliders coming soon</Text>
              </View>

              <Text style={[styles.label, { marginTop: Spacing.md }]}>Icon</Text>
              <View style={styles.iconGrid}>
                {PRESET_ICONS.map((ic) => (
                  <Pressable
                    key={ic}
                    style={[styles.iconBox, formIcon === ic && styles.iconSelected]}
                    onPress={() => setFormIcon(ic)}
                  >
                    <MaterialIcons name={ic as any} size={22} color={formIcon === ic ? '#fff' : Colors.textSecondary} />
                  </Pressable>
                ))}
                {SVG_ICON_NAMES.map((ic) => (
                  <Pressable
                    key={ic}
                    style={[styles.iconBox, formIcon === ic && styles.iconSelected]}
                    onPress={() => setFormIcon(ic)}
                  >
                    <View style={{ width: 22, height: 22, justifyContent: 'center', alignItems: 'center' }}>
                      <CategoryIcon icon={ic} color={formIcon === ic ? '#fff' : Colors.textSecondary} size={20} />
                    </View>
                  </Pressable>
                ))}
              </View>

              <Pressable style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>{editingCat ? 'Update' : 'Save'}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.separator,
    gap: Spacing.md,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  menuList: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    gap: Spacing.md,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    gap: Spacing.md,
  },
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuInfo: {
    flex: 1,
    gap: 4,
  },
  menuLabel: {
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  menuDesc: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  catIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catName: {
    flex: 1,
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  catDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  catActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  actions: {
    flexDirection: 'row',
    width: '100%',
    gap: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
    marginTop: Spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  actionText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  empty: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: 16,
    maxHeight: '85%',
    borderTopWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    marginBottom: Spacing.sm,
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: Colors.inputBg,
    borderWidth: 0.5,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  colorBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSelected: {
    borderColor: '#fff',
    borderWidth: 3,
  },
  placeholderBox: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  iconSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: Spacing.lg,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  soundInfo: {
    flex: 1,
    gap: 4,
  },
  soundLabel: {
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  soundDesc: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  soundSectionLabel: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  sectionLabelText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.4,
  },
  soundSectionDesc: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  alarmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  alarmRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryGlow,
  },
  alarmName: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  alarmNameSelected: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  previewBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  apiSectionLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.4,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  apiInput: {
    backgroundColor: Colors.inputBg,
    borderWidth: 0.5,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },
  apiStatusSaved: {
    fontSize: FontSize.xs,
    color: Colors.success,
    marginTop: Spacing.sm,
    marginLeft: 2,
    fontWeight: FontWeight.medium,
  },
  apiBtnRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  apiBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: Radius.md,
    gap: Spacing.sm,
  },
  apiBtnPrimary: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  apiBtnOutline: {
    borderWidth: 0.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryGlow,
  },
  apiBtnDisabled: {
    opacity: 0.5,
  },
  apiBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  apiTestResult: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  apiTestSuccess: {
    backgroundColor: `${Colors.success}12`,
    borderWidth: 0.5,
    borderColor: `${Colors.success}40`,
  },
  apiTestFail: {
    backgroundColor: `${Colors.danger}12`,
    borderWidth: 0.5,
    borderColor: `${Colors.danger}40`,
  },
  apiTestResultText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    lineHeight: 18,
  },
  apiDivider: {
    height: 0.5,
    backgroundColor: Colors.separator,
    marginVertical: Spacing.xl,
  },
  apiModelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    gap: Spacing.md,
  },
  apiModelInfo: {
    flex: 1,
    gap: 4,
  },
  apiModelLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  apiModelValue: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  apiModelCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: Spacing.sm,
  },
  modelPickerSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: 16,
    maxHeight: '70%',
    borderTopWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  modelPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modelPickerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  modelPickerEmpty: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  modelPickerEmptyText: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
  },
  modelPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  modelPickerItemSelected: {
    backgroundColor: Colors.primaryGlow,
  },
  modelPickerItemInfo: {
    flex: 1,
    gap: 3,
  },
  modelPickerItemName: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  modelPickerItemId: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  modelPickerFreeBadge: {
    backgroundColor: `${Colors.success}18`,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  modelPickerFreeText: {
    fontSize: FontSize.xs,
    color: Colors.success,
    fontWeight: FontWeight.semibold,
  },
  activeProviderSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  activeProviderRow: {
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  activeProviderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    gap: Spacing.md,
  },
  activeProviderBtnSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryGlow,
  },
  activeProviderLabel: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  activeProviderBadge: {
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  activeProviderBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: {
    backgroundColor: Colors.primary,
  },
  stepDotDone: {
    backgroundColor: Colors.success,
  },
  stepDotPending: {
    backgroundColor: Colors.textMuted,
  },
  stepLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  stepLabelDone: {
    color: Colors.success,
    fontWeight: FontWeight.semibold,
  },
  stepLine: {
    width: 32,
    height: 2,
    backgroundColor: Colors.cardBorder,
    borderRadius: 1,
  },
  modelPickerActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingTop: Spacing.lg,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
    marginTop: Spacing.lg,
  },
});
