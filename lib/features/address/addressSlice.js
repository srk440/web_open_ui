import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import * as api from '@/lib/mockApi'

export const fetchAddresses = createAsyncThunk('address/fetchAddresses', () => api.getAddresses())

export const addAddress = createAsyncThunk('address/addAddress', (address) => api.addAddress(address))

const addressSlice = createSlice({
    name: 'address',
    initialState: {
        list: [],
    },
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(fetchAddresses.fulfilled, (state, action) => {
                state.list = action.payload
            })
            .addCase(addAddress.fulfilled, (state, action) => {
                state.list.push(action.payload)
            })
    }
})

export default addressSlice.reducer
