(function () {
  const defaultUserName = 'Enter your name';
  const defaultTitle = 'Add a bank note subject here.';
  const defaultDescription = 'Make notes about bank lending or economic trends here.';

  const root = document.getElementById('strategies-root');
  if (!root) return;

  const form = document.getElementById('bank-note-form');
  const formTitle = document.getElementById('bank-note-form-title');
  const statusBox = document.getElementById('bank-note-status');
  const bankNoteIdInput = document.getElementById('bank-note-id');
  const bankNoteIdDisplayInput = document.getElementById('bank-note-id-display');
  const userIdInput = document.getElementById('user-id');
  const bankNoteTitleInput = document.getElementById('bank-note-title');
  const descriptionInput = document.getElementById('description');
  const cancelButton = document.getElementById('cancel-edit-button');

  function showStatus(message, isError) {
    statusBox.textContent = message || '';
    statusBox.classList.remove('status-success');
    statusBox.classList.remove('status-error');
    if (!message) return;
    statusBox.classList.add(isError ? 'status-error' : 'status-success');
  }

  function resetForm() {
    bankNoteIdInput.value = '';
    if (bankNoteIdDisplayInput) {
      bankNoteIdDisplayInput.value = 'Auto-generated';
    }
    userIdInput.readOnly = false;
    formTitle.textContent = 'Create Bank Note';
    form.reset();
    userIdInput.value = defaultUserName;
    bankNoteTitleInput.value = defaultTitle;
    descriptionInput.value = defaultDescription;
    userIdInput.classList.add('prompt-text');
    bankNoteTitleInput.classList.add('prompt-text');
    descriptionInput.classList.add('prompt-text');
    showStatus('', false);
  }

  function fillFormFromButton(button) {
    bankNoteIdInput.value = button.dataset.id || '';
    if (bankNoteIdDisplayInput) {
      bankNoteIdDisplayInput.value = button.dataset.id || 'Auto-generated';
    }
    userIdInput.value = button.dataset.userName || defaultUserName;
    userIdInput.classList.remove('prompt-text');
    userIdInput.readOnly = true;
    bankNoteTitleInput.value = button.dataset.bankNoteTitle || defaultTitle;
    descriptionInput.value = button.dataset.description || defaultDescription;
    bankNoteTitleInput.classList.toggle('prompt-text', bankNoteTitleInput.value === defaultTitle);
    descriptionInput.classList.toggle('prompt-text', descriptionInput.value === defaultDescription);
    formTitle.textContent = 'Edit Bank Note';
    showStatus('', false);
  }

  async function submitForm(event) {
    event.preventDefault();

    const bankNoteId = String(bankNoteIdInput.value || '').trim();
    const isEdit = !!bankNoteId;

    const payload = {
      user_id: String(userIdInput.value || '').trim(),
      strategy_name: String(bankNoteTitleInput.value || '').trim(),
      description: null,
      risk_tolerance: null,
      min_expected_return: null,
      max_risk_threshold: null,
    };

    if (payload.user_id === defaultUserName) {
      payload.user_id = '';
    }

    if (!payload.user_id) {
      showStatus('User Name is required.', true);
      return;
    }

    if (payload.strategy_name === defaultTitle) {
      payload.strategy_name = '';
    }

    const descriptionValue = String(descriptionInput.value || '').trim();
    payload.description = descriptionValue && descriptionValue !== defaultDescription
      ? descriptionValue
      : null;

    if (!payload.strategy_name) {
      showStatus('Bank Note Title is required.', true);
      return;
    }

    try {
      const url = isEdit ? `/api/strategies/${bankNoteId}` : '/api/strategies';
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Request failed');
      }

      showStatus(isEdit ? 'Bank Note updated.' : 'Bank Note created.', false);
      window.location.reload();
    } catch (error) {
      showStatus(error.message || 'Unable to save bank note.', true);
    }
  }

  async function deleteBankNote(button) {
    const id = button.dataset.id;
    if (!id) return;

    const shouldDelete = window.confirm('Delete this bank note?');
    if (!shouldDelete) return;

    try {
      const response = await fetch(`/api/strategies/${id}`, { method: 'DELETE' });

      if (!response.ok && response.status !== 204) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Delete failed');
      }

      window.location.reload();
    } catch (error) {
      showStatus(error.message || 'Unable to delete bank note.', true);
    }
  }

  function attachPromptBehavior(inputEl, promptText) {
    if (!inputEl) return;

    inputEl.addEventListener('focus', () => {
      if (inputEl.readOnly) return;
      if (inputEl.value === promptText) {
        inputEl.value = '';
      }
      inputEl.classList.remove('prompt-text');
    });

    inputEl.addEventListener('blur', () => {
      if (inputEl.readOnly) return;
      if (!String(inputEl.value || '').trim()) {
        inputEl.value = promptText;
        inputEl.classList.add('prompt-text');
      } else {
        inputEl.classList.remove('prompt-text');
      }
    });
  }

  form.addEventListener('submit', submitForm);
  attachPromptBehavior(userIdInput, defaultUserName);
  attachPromptBehavior(bankNoteTitleInput, defaultTitle);
  attachPromptBehavior(descriptionInput, defaultDescription);

  cancelButton.addEventListener('click', resetForm);

  document.querySelectorAll('.edit-bank-note').forEach((button) => {
    button.addEventListener('click', () => fillFormFromButton(button));
  });

  document.querySelectorAll('.delete-bank-note').forEach((button) => {
    button.addEventListener('click', () => deleteBankNote(button));
  });
})();
