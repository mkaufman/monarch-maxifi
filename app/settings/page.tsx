import SettingsForm from '@/components/SettingsForm';

export default function SettingsPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold text-navy">Settings</h1>
      <p className="text-sm text-text-secondary">
        Configure MaxiFi budget targets and category forecast models.
      </p>
      <div className="pt-4">
        <SettingsForm />
      </div>
    </div>
  );
}
