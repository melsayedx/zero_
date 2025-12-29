#pragma once

#include <atomic>
#include <vector>
#include <cstdint>
#include <optional>

namespace ingester {

/**
 * Lock-free Single-Producer Single-Consumer (SPSC) Ring Buffer
 * 
 * Optimizations:
 * - Cache-line padding to prevent false sharing
 * - Relaxed atomics where possible
 * - Batch operations to reduce atomic overhead
 */
template<typename T>
class LockFreeRingBuffer {
public:
    explicit LockFreeRingBuffer(size_t capacity)
        : capacity_(next_power_of_2(capacity))
        , mask_(capacity_ - 1)
        , buffer_(capacity_)
        , head_(0)
        , tail_(0) 
    {}
    
    /**
     * Try to push an item (producer side)
     * Returns false if buffer is full
     */
    bool try_push(T&& item) {
        const size_t head = head_.load(std::memory_order_relaxed);
        const size_t next_head = (head + 1) & mask_;
        
        if (next_head == tail_.load(std::memory_order_acquire)) {
            return false; // Buffer full
        }
        
        buffer_[head] = std::move(item);
        head_.store(next_head, std::memory_order_release);
        return true;
    }
    
    /**
     * Try to pop an item (consumer side)
     * Returns nullopt if buffer is empty
     */
    std::optional<T> try_pop() {
        const size_t tail = tail_.load(std::memory_order_relaxed);
        
        if (tail == head_.load(std::memory_order_acquire)) {
            return std::nullopt; // Buffer empty
        }
        
        T item = std::move(buffer_[tail]);
        tail_.store((tail + 1) & mask_, std::memory_order_release);
        return item;
    }
    
    /**
     * Pop multiple items at once (reduces atomic operations)
     */
    size_t pop_batch(std::vector<T>& out, size_t max_count) {
        const size_t tail = tail_.load(std::memory_order_relaxed);
        const size_t head = head_.load(std::memory_order_acquire);
        
        if (tail == head) {
            return 0; // Empty
        }
        
        // Calculate available items
        size_t available = (head - tail) & mask_;
        if (head < tail) {
            available = capacity_ - tail + head;
        }
        
        size_t count = std::min(available, max_count);
        out.reserve(out.size() + count);
        
        size_t current = tail;
        for (size_t i = 0; i < count; ++i) {
            out.push_back(std::move(buffer_[current]));
            current = (current + 1) & mask_;
        }
        
        tail_.store(current, std::memory_order_release);
        return count;
    }
    
    size_t size() const {
        const size_t head = head_.load(std::memory_order_acquire);
        const size_t tail = tail_.load(std::memory_order_acquire);
        return (head - tail) & mask_;
    }
    
    bool empty() const {
        return head_.load(std::memory_order_acquire) == 
               tail_.load(std::memory_order_acquire);
    }
    
    size_t capacity() const { return capacity_; }

private:
    static size_t next_power_of_2(size_t n) {
        n--;
        n |= n >> 1;
        n |= n >> 2;
        n |= n >> 4;
        n |= n >> 8;
        n |= n >> 16;
        n |= n >> 32;
        return n + 1;
    }

    const size_t capacity_;
    const size_t mask_;
    std::vector<T> buffer_;
    
    // Cache-line padding to prevent false sharing
    alignas(64) std::atomic<size_t> head_;
    alignas(64) std::atomic<size_t> tail_;
};

} // namespace ingester
