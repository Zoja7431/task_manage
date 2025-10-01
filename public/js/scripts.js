function openEditModal(taskId) {
  fetch(`/api/task/${taskId}`)
    .then(response => {
      if (!response.ok) throw new Error('Failed to fetch task');
      return response.json();
    })
    .then(task => {
      document.getElementById('editTaskId').value = task.id;
      document.getElementById('editTaskTitle').value = task.title;
      document.getElementById('editTaskDueDate').value = task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : '';
      document.getElementById('editTaskPriority').value = task.priority;
      document.getElementById('editTaskDescription').value = task.description || '';
      
      const tagList = document.getElementById('editTaskTagList');
      const selectedTags = task.tags ? task.tags.split(',').map(t => t.trim()) : [];
      tagList.querySelectorAll('.tag-item').forEach(btn => {
        btn.classList.toggle('active', selectedTags.includes(btn.dataset.value));
      });
      document.getElementById('editTaskSelectedTags').value = task.tags || '';

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
    title: document.getElementById('newTaskTitle').value,
    due_date: document.getElementById('newTaskDueDate').value || null,
    priority: document.getElementById('newTaskPriority').value,
    tags: document.getElementById('taskSelectedTags').value,
    description: document.getElementById('newTaskDescription').value
  };

  fetch('/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
      bootstrap.Modal.getInstance(document.getElementById('newTaskModal')).hide();
      window.location.reload();
    })
    .catch(err => {
      alert(err.message || 'Ошибка при создании задачи');
      console.error('Error in createTask:', err);
    });
}

function saveTaskChanges() {
  const taskId = document.getElementById('editTaskId').value;
  const formData = {
    title: document.getElementById('editTaskTitle').value,
    due_date: document.getElementById('editTaskDueDate').value || null,
    priority: document.getElementById('editTaskPriority').value,
    tags: document.getElementById('editTaskSelectedTags').value,
    description: document.getElementById('editTaskDescription').value
  };

  fetch(`/api/task/${taskId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData)
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
      bootstrap.Modal.getInstance(document.getElementById('editTaskModal')).hide();
      window.location.reload();
    })
    .catch(err => {
      alert('Ошибка при сохранении задачи');
      console.error('Error in saveTaskChanges:', err);
    });
}

function markCompleted(taskId, element) {
  fetch(`/tasks/${taskId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
    .then(response => {
      if (!response.ok) throw new Error('Failed to mark task');
      return response.json();
    })
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }
      window.location.reload();
    })
    .catch(err => {
      alert('Ошибка при отметке задачи');
      console.error('Error in markCompleted:', err);
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
  const name = document.getElementById('newTagName').value.trim();
  if (!name) {
    alert('Название тэга обязательно');
    return;
  }
  fetch('/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim().toLowerCase() })
  })
    .then(response => {
      if (!response.ok) {
        return response.json().then(err => { throw new Error(err.error || 'Не удалось создать тэг') });
      }
      return response.json();
    })
    .then(data => {
      if (data.error) {
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
            <button type="button" class="btn btn-sm btn-outline-secondary tag-item me-1" data-value="${data.name}" ondblclick="editTagInline('${data.name}', '${listId}')">${data.name}</button>
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
      document.getElementById('newTagName').value = '';
      bootstrap.Modal.getInstance(document.getElementById('newTaskModal')).hide();
      bootstrap.Modal.getInstance(document.getElementById('newTagModal')).hide();
    })
    .catch(err => {
      alert(err.message || 'Ошибка при создании тэга');
      console.error('Error in createTag:', err);
    });
}

function editTagInline(oldName, listId) {
  const tagWrapper = document.querySelector(`#${listId} .tag-item[data-value="${oldName}"]`).parentElement;
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
      const tagWrapper = document.querySelector(`#${listId} .tag-edit-input`).parentElement;
      tagWrapper.querySelector('.tag-item').style.display = '';
      tagWrapper.querySelector('.tag-edit-input').remove();
    })
    .catch(err => {
      alert(err.message || 'Ошибка при обновлении тэга');
      console.error('Error in saveTagEdit:', err);
      const tagWrapper = document.querySelector(`#${listId} .tag-edit-input`).parentElement;
      tagWrapper.querySelector('.tag-item').style.display = '';
      tagWrapper.querySelector('.tag-edit-input').remove();
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
      document.getElementById('deleteTagName').value = name;
      const message = data.taskCount > 0 
        ? `Тэг "${name}" привязан к ${data.taskCount} задачам. Вы уверены, что хотите его удалить?`
        : `Вы уверены, что хотите удалить тэг "${name}"?`;
      document.getElementById('deleteTagMessage').textContent = message;
      const modal = new bootstrap.Modal(document.getElementById('deleteTagModal'));
      modal.show();
    })
    .catch(err => {
      alert(err.message || 'Ошибка при проверке тэга');
      console.error('Error in confirmDeleteTag:', err);
    });
}

function deleteTag() {
  const name = document.getElementById('deleteTagName').value;
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
      document.querySelectorAll(`.tag-item[data-value="${name}"]`).forEach(btn => {
        const parent = btn.closest('.tag-wrapper');
        parent.remove();
      });
      updateSelectedTags('taskSelectedTags');
      updateSelectedTags('editTaskSelectedTags');
      bootstrap.Modal.getInstance(document.getElementById('deleteTagModal')).hide();
    })
    .catch(err => {
      alert(err.message || 'Ошибка при удалении тэга');
      console.error('Error in deleteTag:', err);
    });
}

function toggleTag(button, inputId) {
  button.classList.toggle('active');
  updateSelectedTags(inputId);
}

function updateSelectedTags(inputId) {
  const tagList = document.getElementById(inputId === 'editTaskSelectedTags' ? 'editTaskTagList' : inputId === 'taskSelectedTags' ? 'taskTagList' : 'filterTagList');
  if (tagList) {
    const selectedTags = Array.from(tagList.querySelectorAll('.tag-item.active')).map(btn => btn.dataset.value);
    document.getElementById(inputId).value = selectedTags.join(',');
  }
}

function toggleDeleteMode(button, listId) {
  const tagList = document.getElementById(listId);
  const isDeleteMode = button.classList.contains('delete-mode-active');
  button.classList.toggle('delete-mode-active');
  button.textContent = isDeleteMode ? 'Удалить тэги' : 'Готово';
  tagList.querySelectorAll('.tag-delete').forEach(btn => {
    btn.classList.toggle('d-none');
  });
}

function clearCompletedTasks() {
  fetch('/tasks/clear-completed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
    .then(response => {
      if (!response.ok) {
        return response.json().then(err => { throw new Error(err.error || 'Не удалось очистить завершённые задачи') });
      }
      return response.json();
    })
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }
      window.location.reload();
    })
    .catch(err => {
      alert(err.message || 'Ошибка при очистке завершённых задач');
      console.error('Error in clearCompletedTasks:', err);
    });
}

document.addEventListener('DOMContentLoaded', () => {
  ['taskTagList', 'editTaskTagList', 'filterTagList'].forEach(listId => {
    const tagList = document.getElementById(listId);
    if (tagList) {
      tagList.querySelectorAll('.tag-item').forEach(btn => {
        btn.onclick = () => toggleTag(btn, listId === 'filterTagList' ? 'filterSelectedTags' : listId === 'taskTagList' ? 'taskSelectedTags' : 'editTaskSelectedTags');
      });
    }
  });
  document.querySelectorAll('.toggle-delete-mode').forEach(btn => {
    btn.onclick = () => toggleDeleteMode(btn, btn.dataset.target);
  });
});