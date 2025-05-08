// Modal logic for destination row click/edit
function openDestinationModal(dest) {
    document.getElementById('destModal').style.display = 'block';
    document.getElementById('modal_dest_id').value = dest._id;
    document.getElementById('modal_name').value = dest.name;
    document.getElementById('modal_display_title').value = dest.display_title;
    document.getElementById('modal_estimated_toll').value = dest.estimated_toll;
}
function closeDestinationModal() {
    document.getElementById('destModal').style.display = 'none';
}
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.destination-row').forEach(function(row) {
        row.addEventListener('click', function() {
            openDestinationModal(JSON.parse(this.dataset.destination));
        });
    });
    document.getElementById('modal_close_btn').onclick = closeDestinationModal;
    document.getElementById('destModal').onclick = function(e) {
        if (e.target === this) closeDestinationModal();
    };
    // Save (edit) handler
    document.getElementById('modal_edit_form').onsubmit = function(e) {
        e.preventDefault();
        var formData = new FormData(this);
        fetch('/backend/destinations/modal_edit', {
            method: 'POST',
            body: formData
        }).then(res => res.json()).then(data => {
            if (data.success) window.location.reload();
            else alert(data.error || 'Failed to save changes.');
        });
    };
    // Delete handler
    document.getElementById('modal_delete_btn').onclick = function() {
        if (!confirm('Delete this destination?')) return;
        var dest_id = document.getElementById('modal_dest_id').value;
        var formData = new FormData();
        formData.append('_id', dest_id);
        fetch('/backend/destinations/modal_delete', {
            method: 'POST',
            body: formData
        }).then(res => res.json()).then(data => {
            if (data.success) window.location.reload();
            else alert(data.error || 'Failed to delete.');
        });
    };
});
