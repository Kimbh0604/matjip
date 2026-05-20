import { useState } from 'react';

export default function useReportForm() {
  const [form, setForm] = useState({
    restaurantName: '',
    location: '',
    recommendedMenu: '',
    reason: '',
    reporterName: '',
    reporterEmail: ''
  });
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus('');

    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || '제보를 보내지 못했습니다.');
      }

      setStatus('제보가 전송되었습니다. 좋은 맛집은 조용히 강합니다.');
      setForm({
        restaurantName: '',
        location: '',
        recommendedMenu: '',
        reason: '',
        reporterName: '',
        reporterEmail: ''
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    form,
    status,
    isSubmitting,
    updateField,
    handleSubmit
  };
}
