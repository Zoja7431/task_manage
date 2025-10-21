function openEditModal(taskId) {
  fetch(`/api/task/${taskId}`)
    .then(response => {
      if (!response.ok) throw new Error('Failed to fetch task');
      return response.json();
    })
    .then(task => {
      document.getElementById('editTaskId').value = task.id;
      document.getElementById('editTaskTitle').value = task.title;
      document.getElementById('editTaskDueDate').value = task.due_date || '';
      document.getElementById('editTaskDueTime').value = task.due_time || '';
      document.getElementById('editTaskDueTime').classList.toggle('d-none', !task.due_time);
      document.getElementById('editTaskPriority').value = task.priority;
      document.getElementById('editTaskDescription').value = task.description || '';
      
      const tagList = document.getElementById('editTaskTagList');
      const selectedTags = task.tags ? task.tags.split(',').map(t => t.trim()) : [];
      tagList.querySelectorAll('.tag-item').forEach(btn => {
        btn.classList.toggle('active', selectedTags.includes(btn.dataset.value));
      });
      document.getElementById('editTaskSelectedTags').value = task.tags || '';

      const timeButton = document.querySelector(`button[onclick*="editTaskDueDate"]`);
      timeButton.textContent = task.due_time ? 'Убрать время' : 'Добавить время';

      const modal = new bootstrap.Modal(document.getElementById('editTaskModal'));
      modal.show();
    })
    .catch(err => {
      alert('Ошибка при загрузке задачи');
      console.error('Error in openEditModal:', err);
    });
}

function createTask() {
  const formData = {
    title: document.getElementById('taskTitle').value,
    due_date: document.getElementById('taskDueDate').value || '',
    due_time: document.getElementById('taskDueTime').value || '',
    priority: document.getElementById('taskPriority').value,
    tags: document.getElementById('taskSelectedTags').value,
    description: document.getElementById('taskDescription').value
  };

  fetch('/tasks', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: new URLSearchParams(formData).toString()
  })
    .then(response => {
      if (response.redirected) {
        window.location.href = response.url;
        return;
      }
      if (!response.ok) {
        return response.json().then(err => { throw new Error(err.error || 'Не удалось создать задачу') });
      }
      return response.json();
    })
    .then(data => {
      if (data && data.error) {
        alert(data.error);
        return;
      }
      if (data && data.id) {
        const activeTasks = document.getElementById('active-tasks');
        const newCard = document.createElement('div');
        newCard.className = `task-card card mb-3 priority-${data.priority} new-task`;
        const dateFormat = data.due_time ? 
          { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : 
          { day: 'numeric', month: 'short' };
        const dueDateStr = data.due_date ? `${data.due_date}T${data.due_time || '00:00'}:00.000Z` : '';
        newCard.innerHTML = `
          <div class="card-body">
            <div class="d-flex align-items-start">
              <div class="custom-checkbox me-3 mt-2">
                <input type="checkbox" id="task-${data.id}" onclick="markCompleted('${data.id}', this)">
                <label for="task-${data.id}"></label>
              </div>
              <div class="flex-grow-1">
                <h5 class="card-title mb-1">${data.title}</h5>
                ${data.description ? `<p class="card-text text-muted small">${data.description}</p>` : ''}
                <div class="d-flex flex-wrap align-items-center mt-2">
                  <span class="badge priority-badge priority-${data.priority} me-2 mb-1">${data.priority.charAt(0).toUpperCase() + data.priority.slice(1)}</span>
                  ${dueDateStr ? `<span class="badge date-badge me-2 mb-1"><i class="bi bi-calendar me-1"></i>${new Date(dueDateStr).toLocaleString('ru-RU', dateFormat)}</span>` : ''}
                  ${data.tags ? data.tags.split(',').map(tag => tag.trim() ? `<span class="badge tag-badge me-2 mb-1">${tag.trim()}</span>` : '').join('') : ''}
                </div>
              </div>
              <div class="dropdown">
                <button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="dropdown">
                  <i class="bi bi-three-dots"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-dark">
                  <li><a class="dropdown-item" href="#" onclick="openEditModal('${data.id}')">Редактировать</a></li>
                  <li><hr class="dropdown-divider"></li>
                  <li><a class="dropdown-item text-danger" href="#" onclick="deleteTask('${data.id}', this)">Удалить</a></li>
                </ul>
              </div>
            </div>
          </div>
        `;
        activeTasks.prepend(newCard);
        setTimeout(() => newCard.classList.remove('new-task'), 500);
      } else {
        window.location.reload();
      }

      document.getElementById('createTaskForm').reset();
      document.getElementById('taskDueTime').classList.add('d-none');
      document.querySelector(`button[onclick*="taskDueDate"]`).textContent = 'Добавить время';
      document.querySelectorAll('#taskTagList .tag-item').forEach(btn => btn.classList.remove('active'));
      document.getElementById('taskSelectedTags').value = '';
      bootstrap.Collapse.getInstance(document.getElementById('taskForm')).hide();
    })
    .catch(err => {
      alert(err.message || 'Ошибка при создании задачи');
      console.error('Error in createTask:', err);
    });
}

function saveTaskChanges() {
  const taskId = document.getElementById('editTaskId').value;
  let dueDate = document.getElementById('editTaskDueDate').value;
  const dueTime = document.getElementById('editTaskDueTime').value;
  if (!dueDate || dueDate === '') dueDate = '';
  const formData = {
    title: document.getElementById('editTaskTitle').value,
    due_date: dueDate,
    due_time: dueTime || '',
    priority: document.getElementById('editTaskPriority').value,
    tags: document.getElementById('editTaskSelectedTags').value,
    description: document.getElementById('editTaskDescription').value
  };

  fetch(`/api/task/${taskId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(formData).toString()
  })
    .then(response => {
      if (!response.ok) throw new Error('Failed to save task');
      return response.json();
    })
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }
      const card = document.querySelector(`#task-${taskId}`).closest('.task-card');
      if (card) {
        card.className = `task-card card mb-3 priority-${formData.priority}`;
        const title = card.querySelector('.card-title');
        title.textContent = formData.title;
        const desc = card.querySelector('.card-text');
        if (desc) {
          desc.textContent = formData.description;
        } else if (formData.description) {
          title.insertAdjacentHTML('afterend', `<p class="card-text text-muted small">${formData.description}</p>`);
        }
        const badges = card.querySelector('.d-flex.flex-wrap');
        if (badges) {
          const dateFormat = formData.due_time ? 
            { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : 
            { day: 'numeric', month: 'short' };
          const dueDateStr = formData.due_date ? `${formData.due_date}T${formData.due_time || '00:00'}:00.000Z` : '';
          badges.innerHTML = `
            <span class="badge priority-badge priority-${formData.priority} me-2 mb-1">${formData.priority.charAt(0).toUpperCase() + formData.priority.slice(1)}</span>
            ${dueDateStr ? `<span class="badge date-badge me-2 mb-1"><i class="bi bi-calendar me-1"></i>${new Date(dueDateStr).toLocaleString('ru-RU', dateFormat)}</span>` : ''}
            ${formData.tags ? formData.tags.split(',').map(tag => tag.trim() ? `<span class="badge tag-badge me-2 mb-1">${tag.trim()}</span>` : '').join('') : ''}
          `;
        }
      }
      bootstrap.Modal.getInstance(document.getElementById('editTaskModal')).hide();
    })
    .catch(err => {
      alert('Ошибка при сохранении задачи');
      console.error('Error in saveTaskChanges:', err);
    });
}

function markCompleted(taskId, element) {
  fetch(`/tasks/${taskId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
  })
    .then(response => {
      if (response.status === 401) {
        window.location.href = '/welcome';
        return;
      }
      if (!response.ok) {
        return response.text().then(text => { throw new Error(text) });
      }
      return response.json();
    })
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }
  const isWeekly = document.getElementById('weekly-page') !== null;
  const card = element.closest(isWeekly ? '.list-group-item' : '.task-card');
      const title = card.querySelector(isWeekly ? 'h5' : '.card-title');
      const statusBadge = card.querySelector('.status-badge');
      const isCheckbox = element.tagName === 'INPUT' && element.type === 'checkbox';
      const activeTasks = !isWeekly ? document.getElementById('active-tasks') : null;
      const completedTasks = !isWeekly ? document.getElementById('completed-tasks') : null;

      if (!isWeekly) {
        card.classList.add('remove-task');
      }
      setTimeout(() => {
        if (!isWeekly) {
          card.classList.remove('remove-task');
        }
        if (data.status === 'completed') {
          card.classList.add('task-completed');
          title.classList.add('text-decoration-line-through', 'text-muted');
          if (statusBadge) {
            statusBadge.classList.remove('bg-primary', 'bg-danger');
            statusBadge.classList.add('bg-success');
            statusBadge.textContent = 'Завершено';
          }
          if (isCheckbox) {
            element.checked = true;
            if (completedTasks) {
              completedTasks.appendChild(card);
              card.classList.add('new-task');
              setTimeout(() => card.classList.remove('new-task'), 500);
            }
          } else {
            element.textContent = 'Вернуть в процесс';
          }
        } else {
          // Анимация стирания штриха
          if (title.classList.contains('text-decoration-line-through')) {
            title.classList.add('strike-animation');
            setTimeout(() => {
              title.classList.remove('strike-animation', 'text-decoration-line-through', 'text-muted');
            }, 600);
          }
          card.classList.remove('task-completed');
          if (statusBadge) {
            statusBadge.classList.remove('bg-success', 'bg-danger');
            statusBadge.classList.add('bg-primary');
            statusBadge.textContent = 'В процессе';
          }
          if (isCheckbox) {
            element.checked = false;
            if (activeTasks) {
              activeTasks.appendChild(card);
              card.classList.add('new-task');
              setTimeout(() => card.classList.remove('new-task'), 500);
            }
          } else {
            element.textContent = 'Отметить как выполненное';
          }
        }
      }, 500);
    })
    .catch(err => {
      console.error('Error in markCompleted:', err);
      alert('Ошибка при отметке задачи: ' + (err.message || 'Неизвестная ошибка'));
    });
}

function deleteTask(taskId, element) {
  if (!confirm('Удалить задачу?')) return;
  fetch(`/tasks/${taskId}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
    .then(response => {
      if (!response.ok) throw new Error('Failed to delete task');
      return response.json();
    })
    .then(data => {
      const card = element.closest('.task-card');
      card.classList.add('remove-task');
      setTimeout(() => card.remove(), 500);
    })
    .catch(err => {
      alert('Ошибка при удалении задачи');
      console.error('Error in deleteTask:', err);
    });
}

function filterTags(input, listId) {
  const value = input.value.toLowerCase();
  const tagList = document.getElementById(listId);
  tagList.querySelectorAll('.tag-item').forEach(btn => {
    btn.style.display = btn.textContent.toLowerCase().includes(value) ? '' : 'none';
  });
}

function preventSubmit(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
  }
}

function createTag() {
  const newTagInput = document.getElementById('newTagName');
  if (!newTagInput) {
    console.error('newTagName input not found');
    alert('Ошибка: поле для тэга не найдено');
    return;
  }
  const name = newTagInput.value.trim().toLowerCase();
  if (!name) {
    alert('Название тэга обязательно');
    return;
  }
  fetch('/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
    .then(response => response.json().catch(() => ({ error: 'Ошибка сервера' })))
    .then(data => {
      if (data.error) {
        console.error('Tag creation response error:', data.error);
        alert(data.error);
        return;
      }
      const tagLists = ['taskTagList', 'editTaskTagList', 'filterTagList'];
      tagLists.forEach(listId => {
        const tagList = document.getElementById(listId);
        if (tagList) {
          const wrapper = document.createElement('div');
          wrapper.className = 'tag-wrapper d-flex align-items-center';
          wrapper.innerHTML = `
            <button type="button" class="btn btn-sm btn-outline-secondary tag-item me-1" data-value="${data.name}" onclick="toggleTag(event, this, '${listId === 'filterTagList' ? 'filterSelectedTags' : listId === 'editTaskTagList' ? 'editTaskSelectedTags' : 'taskSelectedTags'}')" ondblclick="editTagInline('${data.name}', '${listId}')">${data.name}</button>
            <button type="button" class="btn btn-sm btn-outline-danger tag-delete d-none" data-value="${data.name}" onclick="confirmDeleteTag('${data.name}')"><i class="bi bi-dash-circle"></i></button>
          `;
          tagList.appendChild(wrapper);
          if (listId !== 'filterTagList') {
            wrapper.querySelector('.tag-item').classList.add('active');
          }
        }
      });
      updateSelectedTags('taskSelectedTags');
      updateSelectedTags('editTaskSelectedTags');
      newTagInput.value = '';
      const newTagModal = bootstrap.Modal.getInstance(document.getElementById('newTagModal'));
      const editModal = bootstrap.Modal.getInstance(document.getElementById('editTaskModal'));
      if (newTagModal && !editModal) {
        newTagModal.hide();
      }
    })
    .catch(err => {
      console.error('Fetch error in createTag:', err);
      alert('Ошибка при создании тэга: ' + err.message);
    });
}

function editTagInline(oldName, listId) {
  const tagWrapper = document.querySelector(`#${listId} .tag-item[data-value="${oldName}"]`)?.parentElement;
  if (!tagWrapper) return;
  const originalButton = tagWrapper.querySelector('.tag-item');
  originalButton.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-control form-control-sm tag-edit-input';
  input.value = oldName;
  input.onblur = () => saveTagEdit(oldName, input.value, listId);
  input.onkeypress = (e) => {
    if (e.key === 'Enter') saveTagEdit(oldName, input.value, listId);
  };
  tagWrapper.insertBefore(input, tagWrapper.querySelector('.tag-delete'));
  input.focus();
}

function saveTagEdit(oldName, newName, listId) {
  if (!newName.trim()) {
    alert('Название тэга обязательно');
    return;
  }
  fetch(`/tags/${encodeURIComponent(oldName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName.trim().toLowerCase() })
  })
    .then(response => {
      if (!response.ok) {
        return response.json().then(err => { throw new Error(err.error || 'Не удалось обновить тэг') });
      }
      return response.json();
    })
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }
      document.querySelectorAll(`.tag-item[data-value="${oldName}"]`).forEach(btn => {
        btn.dataset.value = data.name;
        btn.textContent = data.name;
      });
      document.querySelectorAll(`.tag-delete[data-value="${oldName}"]`).forEach(btn => {
        btn.dataset.value = data.name;
        btn.setAttribute('onclick', `confirmDeleteTag('${data.name}')`);
      });
      updateSelectedTags('taskSelectedTags');
      updateSelectedTags('editTaskSelectedTags');
      const tagWrapper = document.querySelector(`#${listId} .tag-edit-input`)?.parentElement;
      if (tagWrapper) {
        tagWrapper.querySelector('.tag-item').style.display = '';
        tagWrapper.querySelector('.tag-edit-input')?.remove();
      }
    })
    .catch(err => {
      alert(err.message || 'Ошибка при обновлении тэга');
      console.error('Error in saveTagEdit:', err);
      const tagWrapper = document.querySelector(`#${listId} .tag-edit-input`)?.parentElement;
      if (tagWrapper) {
        tagWrapper.querySelector('.tag-item').style.display = '';
        tagWrapper.querySelector('.tag-edit-input')?.remove();
      }
    });
}

function confirmDeleteTag(name) {
  fetch(`/api/tags/${encodeURIComponent(name)}/tasks`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
    .then(response => {
      if (!response.ok) {
        return response.json().then(err => { throw new Error(err.error || 'Не удалось проверить тэг') });
      }
      return response.json();
    })
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }
      if (data.taskCount > 0) {
        document.getElementById('deleteTagName').value = name;
        const message = `Тэг "${name}" привязан к ${data.taskCount} задачам. Вы уверены, что хотите его удалить?`;
        document.getElementById('deleteTagMessage').textContent = message;
        const modal = new bootstrap.Modal(document.getElementById('deleteTagModal'));
        modal.show();
      } else {
        deleteTagDirect(name);
      }
    })
    .catch(err => {
      alert(err.message || 'Ошибка при проверке тэга');
      console.error('Error in confirmDeleteTag:', err);
    });
}

function deleteTagDirect(name) {
  fetch(`/tags/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  })
    .then(response => {
      if (!response.ok) {
        return response.json().then(err => { throw new Error(err.error || 'Не удалось удалить тэг') });
      }
      return response.json();
    })
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }
      ['taskTagList', 'editTaskTagList', 'filterTagList'].forEach(listId => {
        const tagWrapper = document.querySelector(`#${listId} .tag-item[data-value="${name}"]`)?.parentElement;
        if (tagWrapper) tagWrapper.remove();
      });
      updateSelectedTags('taskSelectedTags');
      updateSelectedTags('editTaskSelectedTags');
    })
    .catch(err => {
      alert(err.message || 'Ошибка при удалении тэга');
      console.error('Error in deleteTagDirect:', err);
    });
}

function deleteTag() {
  const name = document.getElementById('deleteTagName').value;
  deleteTagDirect(name);
  bootstrap.Modal.getInstance(document.getElementById('deleteTagModal')).hide();
}

function toggleTag(event, button, inputId) {
  event.stopPropagation();
  button.classList.toggle('active');
  updateSelectedTags(inputId);
}

function updateSelectedTags(inputId) {
  let tagListId;
  if (inputId === 'editTaskSelectedTags') {
    tagListId = 'editTaskTagList';
  } else if (inputId === 'taskSelectedTags') {
    tagListId = 'taskTagList';
  } else if (inputId === 'filterSelectedTags') {
    tagListId = 'filterTagList';
  }
  
  const tagList = document.getElementById(tagListId);
  if (tagList) {
    const selectedTags = Array.from(tagList.querySelectorAll('.tag-item.active')).map(btn => btn.dataset.value);
    const inputElement = document.getElementById(inputId);
    if (inputElement) {
      inputElement.value = selectedTags.join(',');
    }
  }
}

function toggleDeleteMode(button, listId) {
  button.classList.toggle('delete-mode-active');
  const active = button.classList.contains('delete-mode-active');
  button.textContent = active ? 'Готово' : 'Удалить тэги';
  const tagList = document.getElementById(listId);
  tagList.querySelectorAll('.tag-delete').forEach(btn => btn.classList.toggle('d-none', !active));
  tagList.querySelectorAll('.tag-item').forEach(btn => btn.classList.toggle('delete-mode', active));
}

function clearCompletedTasks() {
  fetch('/tasks/clear-completed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
  })
    .then(response => {
      if (response.status === 401) {
        window.location.href = '/welcome';
        return;
      }
      if (!response.ok) {
        return response.text().then(text => { throw new Error(text) });
      }
      return response.json();
    })
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }
      const completedCards = document.querySelectorAll('#completed-tasks .task-card');
      completedCards.forEach((card, index) => {
        setTimeout(() => {
          card.classList.add('remove-task');
          setTimeout(() => card.remove(), 500);
        }, index * 100);
      });
      bootstrap.Modal.getInstance(document.getElementById('clearCompletedModal')).hide();
    })
    .catch(err => {
      alert('Ошибка при очистке завершённых задач: ' + (err.message || 'Неизвестная ошибка'));
      console.error('Error in clearCompletedTasks:', err);
    });
}

document.addEventListener('DOMContentLoaded', () => {
  const usernameInput = document.getElementById('profileUsername');
  const warningSpan = document.getElementById('username-warning');
  const originalUsername = usernameInput?.value || '';

  if (usernameInput) {
    usernameInput.addEventListener('blur', async () => {
      if (usernameInput.value === originalUsername || !usernameInput.value) {
        warningSpan.style.display = 'none';
        return;
      }
      try {
        const response = await fetch(`/api/check-username?username=${encodeURIComponent(usernameInput.value)}`);
        const data = await response.json();
        warningSpan.textContent = data.available ? '<i class="bi bi-check-circle"></i> Никнейм доступен' : '<i class="bi bi-exclamation-triangle"></i> Никнейм занят!';
        warningSpan.classList.toggle('text-success', data.available);
        warningSpan.classList.toggle('text-warning', !data.available);
        warningSpan.style.display = 'inline';
      } catch (err) {
        warningSpan.textContent = '<i class="bi bi-exclamation-triangle"></i> Ошибка проверки';
        warningSpan.style.display = 'inline';
      }
    });
  }

  const cancelTaskBtn = document.querySelector('#createTaskForm button[data-bs-toggle="collapse"]');
  if (cancelTaskBtn) {
    cancelTaskBtn.addEventListener('click', () => {
      document.getElementById('createTaskForm').reset();
      document.querySelectorAll('#taskTagList .tag-item').forEach(btn => btn.classList.remove('active'));
      document.getElementById('taskSelectedTags').value = '';
    });
  }

  const createTaskForm = document.getElementById('createTaskForm');
  if (createTaskForm) {
    createTaskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      createTask();
    });
  }

  const filterForm = document.getElementById('filterForm');
  if (filterForm) {
    filterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      updateSelectedTags('filterSelectedTags');
      // Принудительно обновляем URL с выбранными тегами
      const selectedTags = document.getElementById('filterSelectedTags').value;
      const url = new URL(window.location);
      if (selectedTags) {
        url.searchParams.set('tags', selectedTags);
      } else {
        url.searchParams.delete('tags');
      }
      window.location.href = url.toString();
    });
  }

  const completedCollapse = document.getElementById('completedCollapse');
  const showCompletedBtn = document.querySelector('.show-completed');
  if (completedCollapse && showCompletedBtn) {
    if (localStorage.getItem('showCompleted') === 'true') {
      new bootstrap.Collapse(completedCollapse, { toggle: false }).show();
      showCompletedBtn.textContent = 'Скрыть завершённые';
    }
    completedCollapse.addEventListener('shown.bs.collapse', () => {
      showCompletedBtn.textContent = 'Скрыть завершённые';
      localStorage.setItem('showCompleted', 'true');
    });
    completedCollapse.addEventListener('hidden.bs.collapse', () => {
      showCompletedBtn.textContent = 'Показать завершённые';
      localStorage.setItem('showCompleted', 'false');
    });
  }

  const passwordInput = document.getElementById('profilePassword');
  const confirmInput = document.getElementById('profileConfirmPassword');
  if (passwordInput && confirmInput) {
    const passwordError = document.createElement('div');
    passwordError.className = 'invalid-feedback d-inline ms-2';
    passwordInput.parentNode.appendChild(passwordError);

    const confirmError = document.createElement('div');
    confirmError.className = 'invalid-feedback d-inline ms-2';
    confirmInput.parentNode.appendChild(confirmError);

    function validatePasswords() {
      passwordError.textContent = '';
      confirmError.textContent = '';
      if (passwordInput.value && passwordInput.value.length < 6) {
        passwordError.textContent = 'Пароль должен быть не менее 6 символов';
      }
      if (passwordInput.value && confirmInput.value !== passwordInput.value) {
        confirmError.textContent = 'Пароли не совпадают';
      }
    }
    passwordInput.addEventListener('input', validatePasswords);
    confirmInput.addEventListener('input', validatePasswords);
  }

  const registerForm = document.querySelector('form[action="/register"]');
  if (registerForm) {
    const password = registerForm.querySelector('#password');
    const confirm = registerForm.querySelector('#confirm_password');
    const pError = document.createElement('div');
    pError.className = 'invalid-feedback d-inline ms-2';
    if (password) password.parentNode.appendChild(pError);

    const cError = document.createElement('div');
    cError.className = 'invalid-feedback d-inline ms-2';
    if (confirm) confirm.parentNode.appendChild(cError);

    function validate() {
      pError.textContent = password.value && password.value.length < 6 ? 'Пароль должен быть не менее 6 символов' : '';
      cError.textContent = confirm.value !== password.value ? 'Пароли не совпадают' : '';
    }

    if (password) password.addEventListener('input', validate);
    if (confirm) confirm.addEventListener('input', validate);
  }

  const titleInput = document.getElementById('taskTitle');
  if (titleInput) {
    let savedTitle = '';
    document.querySelectorAll('#optionalFields .accordion-collapse').forEach(collapse => {
      collapse.addEventListener('show.bs.collapse', () => {
        savedTitle = titleInput.value;
      });
      collapse.addEventListener('shown.bs.collapse', () => {
        titleInput.value = savedTitle;
      });
    });
  }
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});

function toggleTimeInput(dateInputId, timeInputId, warningId) {
  const dateInput = document.getElementById(dateInputId);
  const timeInput = document.getElementById(timeInputId);
  const warning = document.getElementById(warningId);
  const button = document.querySelector(`button[onclick*="${dateInputId}"]`);
  
  if (!dateInput.value) {
    button.classList.add('error');
    warning.style.display = 'block';
    setTimeout(() => {
      button.classList.remove('error');
      warning.style.display = 'none';
    }, 2000);
    return;
  }
  
  timeInput.classList.toggle('d-none');
  button.textContent = timeInput.classList.contains('d-none') ? 'Добавить время' : 'Убрать время';
}

function setDate(dateInputId, type) {
  const dateInput = document.getElementById(dateInputId);
  const today = new Date();
  
  if (type === 'today') {
    dateInput.value = today.toISOString().split('T')[0];
  } else if (type === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    dateInput.value = tomorrow.toISOString().split('T')[0];
  }
}
