function openEditModal(taskId) {
    fetch(`/api/task/${taskId}`)
        .then(response => response.json())
        .then(task => {
            document.getElementById('editTaskId').value = task.id;
            document.getElementById('editTaskTitle').value = task.title;
            document.getElementById('editTaskDueDate').value = task.due_date || '';
            document.getElementById('editTaskPriority').value = task.priority;
            document.getElementById('editTaskStatus').value = task.status;
            document.getElementById('editTaskTags').value = task.tags;
            document.getElementById('editTaskDescription').value = task.description || '';
            
            const modal = new bootstrap.Modal(document.getElementById('editTaskModal'));
            modal.show();
        })
        .catch(err => {
            alert('Ошибка при загрузке задачи');
            console.error(err);
        });
}

function saveTaskChanges() {
    const taskId = document.getElementById('editTaskId').value;
    const formData = {
        title: document.getElementById('editTaskTitle').value,
        due_date: document.getElementById('editTaskDueDate').value || null,
        priority: document.getElementById('editTaskPriority').value,
        status: document.getElementById('editTaskStatus').value,
        tags: document.getElementById('editTaskTags').value,
        description: document.getElementById('editTaskDescription').value
    };

    fetch(`/api/task/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
                return;
            }
            const modal = bootstrap.Modal.getInstance(document.getElementById('editTaskModal'));
            modal.hide();
            window.location.reload(); // Обновление страницы
        })
        .catch(err => {
            alert('Ошибка при сохранении задачи');
            console.error(err);
        });
}