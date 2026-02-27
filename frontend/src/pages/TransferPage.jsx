import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { accountsAPI, transactionsAPI } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { ArrowLeftRight, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export const TransferPage = () => {
    const [accounts, setAccounts] = useState([]);
    const [sourceAccount, setSourceAccount] = useState('');
    const [recipientAccountId, setRecipientAccountId] = useState('');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const response = await accountsAPI.getAll();
                setAccounts(response.data);
                if (response.data.length > 0) {
                    setSourceAccount(response.data[0].id);
                }
            } catch (error) {
                toast.error('Failed to load accounts');
            }
        };
        fetchAccounts();
    }, []);

    const getSelectedAccountBalance = () => {
        const account = accounts.find(acc => acc.id === sourceAccount);
        if (!account) return 0;
        return currency === 'USD' ? account.balance_usd : account.balance_eur;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        const numAmount = parseFloat(amount);
        if (!sourceAccount || !recipientAccountId || !amount || numAmount <= 0) {
            toast.error('Please fill in all required fields');
            return;
        }

        if (numAmount > getSelectedAccountBalance()) {
            toast.error('Insufficient funds in source account');
            return;
        }

        setLoading(true);
        try {
            await transactionsAPI.create({
                account_id: sourceAccount,
                transaction_type: 'transfer',
                amount: numAmount,
                currency,
                description: description || `Transfer to ${recipientAccountId}`,
                recipient_account_id: recipientAccountId,
            });
            
            setSuccess(true);
            toast.success('Transfer completed successfully!');
            setAmount('');
            setRecipientAccountId('');
            setDescription('');
            
            // Refresh accounts
            const response = await accountsAPI.getAll();
            setAccounts(response.data);
            
            setTimeout(() => setSuccess(false), 3000);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Transfer failed');
        } finally {
            setLoading(false);
        }
    };

    const currentBalance = getSelectedAccountBalance();

    return (
        <Layout>
            <div className="max-w-2xl mx-auto space-y-8" data-testid="transfer-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl font-heading font-bold text-white">Transfer Funds</h1>
                    <p className="text-slate-500 mt-1">Send money to another account</p>
                </motion.div>

                {/* Info Banner */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex items-start gap-3 p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30"
                >
                    <AlertCircle className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-cyan-400 font-medium">Instant Transfers</p>
                        <p className="text-sm text-cyan-400/70 mt-1">
                            Transfers between LIONSBIT BANK accounts are processed instantly. 
                            Enter the recipient's account ID to send funds.
                        </p>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                                    <ArrowLeftRight className="w-6 h-6 text-cyan-400" />
                                </div>
                                <div>
                                    <CardTitle className="text-white font-heading">Send Transfer</CardTitle>
                                    <CardDescription className="text-slate-500">
                                        Funds will be transferred immediately
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="sourceAccount" className="text-slate-300">From Account</Label>
                                    <Select value={sourceAccount} onValueChange={setSourceAccount}>
                                        <SelectTrigger className="bg-slate-950/50 border-slate-800 text-white" data-testid="source-account-selector">
                                            <SelectValue placeholder="Choose source account" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-slate-800">
                                            {accounts.map((acc) => (
                                                <SelectItem key={acc.id} value={acc.id} className="text-white">
                                                    {acc.account_type.charAt(0).toUpperCase() + acc.account_type.slice(1)} Account
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {sourceAccount && (
                                        <p className="text-sm text-slate-500">
                                            Available: <span className="font-mono text-emerald-400">
                                                {currency === 'USD' ? '$' : '€'}{currentBalance.toFixed(2)}
                                            </span>
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="recipientAccountId" className="text-slate-300">Recipient Account ID</Label>
                                    <Input
                                        id="recipientAccountId"
                                        type="text"
                                        placeholder="Enter recipient's account ID"
                                        value={recipientAccountId}
                                        onChange={(e) => setRecipientAccountId(e.target.value)}
                                        className="bg-slate-950/50 border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 text-white placeholder:text-slate-600 font-mono"
                                        required
                                        data-testid="recipient-account-input"
                                    />
                                    <p className="text-xs text-slate-600">
                                        You can find account IDs on the Accounts page
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="amount" className="text-slate-300">Amount</Label>
                                        <Input
                                            id="amount"
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            max={currentBalance}
                                            placeholder="0.00"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            className="bg-slate-950/50 border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 text-white placeholder:text-slate-600 font-mono"
                                            required
                                            data-testid="amount-input"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="currency" className="text-slate-300">Currency</Label>
                                        <Select value={currency} onValueChange={setCurrency}>
                                            <SelectTrigger className="bg-slate-950/50 border-slate-800 text-white" data-testid="currency-selector">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-900 border-slate-800">
                                                <SelectItem value="USD" className="text-white">USD</SelectItem>
                                                <SelectItem value="EUR" className="text-white">EUR</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="description" className="text-slate-300">Note (Optional)</Label>
                                    <Textarea
                                        id="description"
                                        placeholder="Add a note for this transfer..."
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="bg-slate-950/50 border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 text-white placeholder:text-slate-600 min-h-[100px]"
                                        data-testid="description-input"
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    disabled={loading || success}
                                    className={`w-full font-medium transition-all ${
                                        success 
                                            ? 'bg-cyan-600 hover:bg-cyan-600' 
                                            : 'bg-cyan-500 hover:bg-cyan-600'
                                    } text-white`}
                                    data-testid="transfer-submit-btn"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Processing...
                                        </>
                                    ) : success ? (
                                        <>
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            Transfer Complete!
                                        </>
                                    ) : (
                                        'Send Transfer'
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </Layout>
    );
};

export default TransferPage;
