/**
 * PasargameX Payment Integration
 * Complete payment flow with Midtrans integration and WebSocket notifications
 */

class PaymentManager {
    constructor(apiBaseUrl, websocket) {
        this.apiBaseUrl = apiBaseUrl;
        this.ws = websocket;
        this.currentTransaction = null;
        this.statusCheckInterval = null;
    }

    /**
     * Create instant payment transaction
     */
    async createInstantTransaction(productId, paymentMethod = 'midtrans_snap') {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) {
                throw new Error('Please login first');
            }

            showNotification('Creating payment transaction...', 'info');

            const response = await fetch(`${this.apiBaseUrl}/v1/payments/transactions/instant`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    product_id: productId,
                    delivery_method: 'instant',
                    payment_method: paymentMethod,
                    embed: false // Use redirect mode
                })
            });

            const data = await response.json();
            console.log('Payment transaction response:', data);

            if (response.ok && data.success) {
                this.currentTransaction = data.data;
                
                // Immediately redirect to Midtrans payment page
                if (data.data.midtrans_redirect_url) {
                    showNotification('Redirecting to Midtrans payment page...', 'success');
                    
                    // Give user a moment to see the notification, then redirect
                    setTimeout(() => {
                        window.location.href = data.data.midtrans_redirect_url;
                    }, 1500);
                } else {
                    // Fallback: show modal if redirect URL not available
                    this.showPaymentModal(data.data);
                    // Start monitoring payment status
                    this.startStatusMonitoring(data.data.id);
                }
                
                return data.data;
            } else {
                throw new Error(data.error?.message || 'Failed to create transaction');
            }
        } catch (error) {
            console.error('Payment transaction error:', error);
            showNotification(`Failed to create transaction: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Show payment modal with options
     */
    showPaymentModal(transaction) {
        const modal = document.createElement('div');
        modal.id = 'paymentModal';
        modal.className = 'payment-modal';
        modal.innerHTML = `
            <div class="payment-modal-content">
                <div class="payment-header">
                    <h3>💳 Complete Payment</h3>
                    <button onclick="this.closest('.payment-modal').remove()" class="close-btn">&times;</button>
                </div>
                <div class="payment-body">
                    <div class="transaction-info">
                        <p><strong>Transaction ID:</strong> ${transaction.id}</p>
                        <p><strong>Amount:</strong> Rp ${transaction.total_amount?.toLocaleString('id-ID') || 'N/A'}</p>
                        <p><strong>Status:</strong> <span class="status-badge status-${transaction.status}">${transaction.status}</span></p>
                    </div>
                    <div class="payment-options">
                        <button onclick="window.paymentManager.redirectToMidtrans('${transaction.midtrans_redirect_url}')" class="btn-primary">
                            🚀 Pay with Midtrans
                        </button>
                        <button onclick="window.paymentManager.checkPaymentStatus('${transaction.id}')" class="btn-secondary">
                            🔄 Check Status
                        </button>
                    </div>
                    <div class="payment-status" id="paymentStatus-${transaction.id}">
                        <p class="status-info">Click "Pay with Midtrans" to complete your payment</p>
                    </div>
                </div>
            </div>
        `;

        // Add styles
        if (!document.getElementById('paymentModalStyles')) {
            const styles = document.createElement('style');
            styles.id = 'paymentModalStyles';
            styles.textContent = `
                .payment-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                }
                .payment-modal-content {
                    background: white;
                    border-radius: 12px;
                    padding: 0;
                    width: 90%;
                    max-width: 500px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                }
                .payment-header {
                    background: linear-gradient(135deg, #007bff, #0056b3);
                    color: white;
                    padding: 20px;
                    border-radius: 12px 12px 0 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .payment-body {
                    padding: 20px;
                }
                .transaction-info {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }
                .status-badge {
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: bold;
                }
                .status-payment_pending { background: #ffc107; color: #856404; }
                .status-paid { background: #28a745; color: white; }
                .status-completed { background: #17a2b8; color: white; }
                .payment-options {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 15px;
                }
                .btn-primary, .btn-secondary {
                    flex: 1;
                    padding: 12px;
                    border: none;
                    border-radius: 8px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                .btn-primary {
                    background: #28a745;
                    color: white;
                }
                .btn-primary:hover {
                    background: #218838;
                }
                .btn-secondary {
                    background: #6c757d;
                    color: white;
                }
                .btn-secondary:hover {
                    background: #5a6268;
                }
                .payment-status {
                    background: #e9ecef;
                    padding: 10px;
                    border-radius: 6px;
                    font-size: 14px;
                }
                .close-btn {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 24px;
                    cursor: pointer;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                }
            `;
            document.head.appendChild(styles);
        }

        document.body.appendChild(modal);
    }

    /**
     * Redirect user to Midtrans payment page
     */
    redirectToMidtrans(redirectUrl) {
        if (!redirectUrl) {
            showNotification('Payment URL not available', 'error');
            return;
        }

        showNotification('Redirecting to Midtrans payment page...', 'info');
        
        // Open Midtrans in new window/tab
        const paymentWindow = window.open(redirectUrl, 'midtrans_payment', 'width=800,height=600');
        
        // Monitor when payment window closes
        const checkClosed = setInterval(() => {
            if (paymentWindow.closed) {
                clearInterval(checkClosed);
                showNotification('Payment window closed. Checking payment status...', 'info');
                if (this.currentTransaction) {
                    this.checkPaymentStatus(this.currentTransaction.id);
                }
            }
        }, 1000);
    }

    /**
     * Check payment status
     */
    async checkPaymentStatus(transactionId) {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) {
                throw new Error('Please login first');
            }

            const response = await fetch(`${this.apiBaseUrl}/v1/payments/transactions/${transactionId}/status`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();
            console.log('Payment status response:', data);

            if (response.ok && data.success) {
                this.updatePaymentStatus(transactionId, data.data);
                
                // Handle different payment statuses
                if (data.data.payment_status === 'success') {
                    showNotification('🎉 Payment successful! Credentials delivered.', 'success');
                    this.stopStatusMonitoring();
                    this.closePaymentModal();
                } else if (data.data.payment_status === 'failed') {
                    showNotification('❌ Payment failed. Please try again.', 'error');
                } else {
                    showNotification(`Payment status: ${data.data.payment_status}`, 'info');
                }

                return data.data;
            } else {
                throw new Error(data.error?.message || 'Failed to check payment status');
            }
        } catch (error) {
            console.error('Payment status check error:', error);
            showNotification(`Failed to check payment status: ${error.message}`, 'error');
        }
    }

    /**
     * Update payment status in UI
     */
    updatePaymentStatus(transactionId, statusData) {
        const statusElement = document.getElementById(`paymentStatus-${transactionId}`);
        if (statusElement) {
            let statusMessage = '';
            let statusClass = '';

            switch (statusData.payment_status) {
                case 'pending':
                    statusMessage = '⏳ Payment is pending. Please complete payment at Midtrans.';
                    statusClass = 'status-pending';
                    break;
                case 'success':
                    statusMessage = '✅ Payment successful! Transaction completed.';
                    statusClass = 'status-success';
                    break;
                case 'failed':
                    statusMessage = '❌ Payment failed. Please try again.';
                    statusClass = 'status-error';
                    break;
                default:
                    statusMessage = `Status: ${statusData.payment_status}`;
                    statusClass = 'status-info';
            }

            statusElement.innerHTML = `<p class="${statusClass}">${statusMessage}</p>`;
        }
    }

    /**
     * Start monitoring payment status
     */
    startStatusMonitoring(transactionId) {
        // Check every 10 seconds
        this.statusCheckInterval = setInterval(() => {
            this.checkPaymentStatus(transactionId);
        }, 10000);

        // Stop after 10 minutes (payment timeout)
        setTimeout(() => {
            this.stopStatusMonitoring();
        }, 600000);
    }

    /**
     * Stop monitoring payment status
     */
    stopStatusMonitoring() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
        }
    }

    /**
     * Close payment modal
     */
    closePaymentModal() {
        const modal = document.getElementById('paymentModal');
        if (modal) {
            modal.remove();
        }
    }

    /**
     * Handle webhook notification via WebSocket
     */
    handleWebSocketPaymentUpdate(data) {
        console.log('WebSocket payment update:', data);
        
        if (data.type === 'payment_status_update' && this.currentTransaction) {
            this.updatePaymentStatus(this.currentTransaction.id, data.transaction);
            
            // Show notification
            const status = data.transaction.payment_status;
            if (status === 'success') {
                showNotification('🎉 Payment completed! Credentials delivered.', 'success');
                this.stopStatusMonitoring();
                this.closePaymentModal();
            } else {
                showNotification(`Payment status updated: ${status}`, 'info');
            }
        }
    }
}

// Global notification function (should exist in main HTML)
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add styles if not exist
    if (!document.getElementById('notificationStyles')) {
        const styles = document.createElement('style');
        styles.id = 'notificationStyles';
        styles.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 8px;
                color: white;
                font-weight: 500;
                z-index: 10001;
                min-width: 300px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                transform: translateX(100%);
                transition: transform 0.3s ease;
            }
            .notification-info { background: #17a2b8; }
            .notification-success { background: #28a745; }
            .notification-error { background: #dc3545; }
            .notification-warning { background: #ffc107; color: #856404; }
            .notification.show { transform: translateX(0); }
        `;
        document.head.appendChild(styles);
    }
    
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Auto remove
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Export for use in HTML
window.PaymentManager = PaymentManager;