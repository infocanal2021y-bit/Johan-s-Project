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
import { Download, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export const DepositPage = () => {
    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState('');
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
                    setSelectedAccount(response.data[0].id);
                }
            } catch (error) {
                toast.error('Failed to load accounts');
            }
        };
        fetchAccounts();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!selectedAccount || !amount || parseFloat(amount) <= 0) {
            toast.error('Please fill in all required fields');
            return;
        }

        setLoading(true);
        try {
            await transactionsAPI.create({
                account_id: selectedAccount,
                transaction_type: 'deposit',
                amount: parseFloat(amount),
                currency,
                description: description || undefined,
            });
            
            setSuccess(true);
            toast.success('Deposit successful!');
            setAmount('');
            setDescription('');
            
            setTimeout(() => setSuccess(false), 3000);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Deposit failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout>
            <div className="max-w-2xl mx-auto space-y-8" data-testid="deposit-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl font-heading font-bold text-white">Make a Deposit</h1>
                    <p className="text-slate-500 mt-1">Add funds to your account</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                    <Download className="w-6 h-6 text-emerald-400" />
                                </div>
                                <div>
                                    <CardTitle className="text-white font-heading">Deposit Funds</CardTitle>
                                    <CardDescription className="text-slate-500">
                                        Funds will be available immediately
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="account" className="text-slate-300">Select Account</Label>
                                    <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                                        <SelectTrigger className="bg-slate-950/50 border-slate-800 text-white" data-testid="account-selector">
                                            <SelectValue placeholder="Choose an account" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-slate-800">
                                            {accounts.map((acc) => (
                                                <SelectItem key={acc.id} value={acc.id} className="text-white">
                                                    {acc.account_type.charAt(0).toUpperCase() + acc.account_type.slice(1)} Account
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="amount" className="text-slate-300">Amount</Label>
                                        <Input
                                            id="amount"
                                            type="number"
                                            step="0.01"
                                            min="0.01"
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
                                    <Label htmlFor="description" className="text-slate-300">Description (Optional)</Label>
                                    <Textarea
                                        id="description"
                                        placeholder="Add a note for this deposit..."
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
                                            ? 'bg-emerald-600 hover:bg-emerald-600' 
                                            : 'bg-emerald-500 hover:bg-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)]'
                                    } text-white`}
                                    data-testid="deposit-submit-btn"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Processing...
                                        </>
                                    ) : success ? (
                                        <>
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            Deposit Successful!
                                        </>
                                    ) : (
                                        'Deposit Funds'
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

export default DepositPage;
